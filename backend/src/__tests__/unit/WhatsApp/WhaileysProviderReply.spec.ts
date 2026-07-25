jest.mock("../../../libs/socket", () => ({
  getIO: () => ({ emit: jest.fn() })
}));

jest.mock("whaileys", () => {
  const actual = jest.requireActual("whaileys");
  return {
    ...actual,
    default: jest.fn(),
    fetchLatestWaWebVersion: jest
      .fn()
      .mockResolvedValue({ version: [2, 3000, 0] })
  };
});

import makeWASocket from "whaileys";
import Whatsapp from "../../../models/Whatsapp";
import { WhaileysProvider } from "../../../providers/WhatsApp/Implementations/whaileys";

describe("WhaileysProvider reply/quote handling", () => {
  const sessionId = 9001;
  let sendMessageMock: jest.Mock;

  beforeEach(async () => {
    sendMessageMock = jest.fn().mockResolvedValue({
      key: { id: "OUT123" },
      messageTimestamp: 1234567890
    });

    const fakeWbot = {
      ev: { on: jest.fn(), removeAllListeners: jest.fn() },
      sendMessage: sendMessageMock,
      user: { id: "555199999999:1@s.whatsapp.net" },
      end: jest.fn()
    };

    (makeWASocket as jest.Mock).mockReturnValue(fakeWbot);

    const fakeWhatsapp = {
      id: sessionId,
      session: null
    } as unknown as Whatsapp;

    await WhaileysProvider.init(fakeWhatsapp);
  });

  it("sendMessage attaches a quoted key/message and never puts contextInfo in the content", async () => {
    await WhaileysProvider.sendMessage(
      sessionId,
      "5511999999999",
      "Reply body",
      {
        quotedMessageId: "ORIGINAL_ID",
        quotedMessageFromMe: false,
        quotedMessageBody: "Original message text"
      }
    );

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const [jid, content, options] = sendMessageMock.mock.calls[0];

    expect(jid).toBe("5511999999999@s.whatsapp.net");
    expect(content).toEqual({ text: "Reply body" });
    expect(content).not.toHaveProperty("contextInfo");
    expect(options).toEqual({
      quoted: {
        key: {
          remoteJid: "5511999999999@s.whatsapp.net",
          fromMe: false,
          id: "ORIGINAL_ID"
        },
        message: { conversation: "Original message text" }
      }
    });
  });

  it("sendMessage passes no third argument for a plain (non-reply) message", async () => {
    await WhaileysProvider.sendMessage(
      sessionId,
      "5511999999999",
      "Plain body"
    );

    expect(sendMessageMock).toHaveBeenCalledWith(
      "5511999999999@s.whatsapp.net",
      { text: "Plain body" },
      undefined
    );
  });

  it("sendMedia attaches a quoted key/message and never puts contextInfo in the media payload", async () => {
    const media = {
      filename: "photo.jpg",
      mimetype: "image/jpeg",
      data: Buffer.from("fake-image-data")
    };

    await WhaileysProvider.sendMedia(sessionId, "5511999999999", media, {
      quotedMessageId: "ORIGINAL_MEDIA_ID",
      quotedMessageFromMe: true,
      quotedMessageBody: "Original caption"
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const [jid, content, options] = sendMessageMock.mock.calls[0];

    expect(jid).toBe("5511999999999@s.whatsapp.net");
    expect(content).not.toHaveProperty("contextInfo");
    expect(content.image).toBeDefined();
    expect(options).toEqual({
      quoted: {
        key: {
          remoteJid: "5511999999999@s.whatsapp.net",
          fromMe: true,
          id: "ORIGINAL_MEDIA_ID"
        },
        message: { conversation: "Original caption" }
      }
    });
  });

  it("sendMedia passes no third argument for plain (non-reply) media", async () => {
    const media = {
      filename: "photo.jpg",
      mimetype: "image/jpeg",
      data: Buffer.from("fake-image-data")
    };

    await WhaileysProvider.sendMedia(sessionId, "5511999999999", media, {});

    const [, , options] = sendMessageMock.mock.calls[0];
    expect(options).toBeUndefined();
  });
});
