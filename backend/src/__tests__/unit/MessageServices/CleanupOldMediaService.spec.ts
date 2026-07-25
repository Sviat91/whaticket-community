jest.mock("../../../models/Message", () => ({
  __esModule: true,
  default: {
    findAll: jest.fn()
  }
}));

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      unlink: jest.fn()
    }
  };
});

import fs from "fs";
import { Op } from "sequelize";
import Message from "../../../models/Message";
import CleanupOldMediaService from "../../../services/MessageServices/CleanupOldMediaService";

const findAllMock = Message.findAll as jest.Mock;
const unlinkMock = fs.promises.unlink as jest.Mock;

const fakeMessage = (fileName: string) => ({
  getDataValue: jest.fn().mockReturnValue(fileName),
  update: jest.fn().mockResolvedValue(undefined)
});

describe("CleanupOldMediaService", () => {
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    setTimeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation(((cb: () => void) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);
  });

  it("unlinks the file and nulls mediaUrl for an old message", async () => {
    const oldMessage = fakeMessage("old-file.jpg");
    findAllMock.mockResolvedValueOnce([oldMessage]).mockResolvedValueOnce([]);
    unlinkMock.mockResolvedValueOnce(undefined);

    await CleanupOldMediaService();

    expect(unlinkMock).toHaveBeenCalledWith(
      expect.stringContaining("old-file.jpg")
    );
    expect(oldMessage.update).toHaveBeenCalledWith({ mediaUrl: null });
  });

  it("only queries messages with mediaUrl set and createdAt older than the retention cutoff", async () => {
    findAllMock.mockResolvedValueOnce([]);

    await CleanupOldMediaService();

    const { where } = findAllMock.mock.calls[0][0];
    expect(where.mediaUrl).toEqual({ [Op.ne]: null });

    const cutoff = where.createdAt[Op.lt] as Date;
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - 30);
    expect(
      Math.abs(cutoff.getTime() - expectedCutoff.getTime())
    ).toBeLessThan(5000);
  });

  it("keeps processing the rest of the batch when unlink fails for one file", async () => {
    const badMessage = fakeMessage("bad-file.jpg");
    const goodMessage = fakeMessage("good-file.jpg");
    findAllMock
      .mockResolvedValueOnce([badMessage, goodMessage])
      .mockResolvedValueOnce([]);
    unlinkMock
      .mockRejectedValueOnce(new Error("disk error"))
      .mockResolvedValueOnce(undefined);

    await CleanupOldMediaService();

    expect(badMessage.update).toHaveBeenCalledWith({ mediaUrl: null });
    expect(goodMessage.update).toHaveBeenCalledWith({ mediaUrl: null });
  });

  it("keeps fetching batches until an empty batch is returned, pausing between batches", async () => {
    const batch1 = [fakeMessage("f1.jpg")];
    const batch2 = [fakeMessage("f2.jpg")];
    findAllMock
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([]);
    unlinkMock.mockResolvedValue(undefined);

    await CleanupOldMediaService();

    expect(findAllMock).toHaveBeenCalledTimes(3);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);
  });
});
