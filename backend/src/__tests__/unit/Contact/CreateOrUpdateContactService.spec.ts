jest.mock("../../../libs/socket", () => ({
  getIO: () => ({ emit: jest.fn() })
}));

import Contact from "../../../models/Contact";
import CreateOrUpdateContactService from "../../../services/ContactServices/CreateOrUpdateContactService";
import { disconnect, truncate } from "../../utils/database";

describe("CreateOrUpdateContactService", () => {
  beforeEach(async () => {
    await truncate();
  });

  afterEach(async () => {
    await truncate();
  });

  afterAll(async () => {
    await disconnect();
  });

  it("should overwrite the name when the existing contact is not locked", async () => {
    await Contact.create({
      name: "Old Name",
      number: "5511111111111",
      email: "",
      isGroup: false,
      nameLocked: false
    });

    const contact = await CreateOrUpdateContactService({
      name: "New Name",
      number: "5511111111111",
      isGroup: false
    });

    expect(contact.name).toBe("New Name");
    expect(contact.nameLocked).toBe(false);
  });

  it("should not overwrite the name when the existing contact is locked", async () => {
    await Contact.create({
      name: "Locked Name",
      number: "5522222222222",
      email: "",
      isGroup: false,
      nameLocked: true
    });

    const contact = await CreateOrUpdateContactService({
      name: "Incoming Name",
      number: "5522222222222",
      isGroup: false
    });

    expect(contact.name).toBe("Locked Name");
    expect(contact.nameLocked).toBe(true);
  });

  it("should keep the existing name when the incoming name is empty and the contact is unlocked", async () => {
    await Contact.create({
      name: "Existing Name",
      number: "5533333333333",
      email: "",
      isGroup: false,
      nameLocked: false
    });

    const contact = await CreateOrUpdateContactService({
      name: "",
      number: "5533333333333",
      isGroup: false
    });

    expect(contact.name).toBe("Existing Name");
  });

  it("should create a new auto contact as unlocked", async () => {
    const contact = await CreateOrUpdateContactService({
      name: "Brand New Contact",
      number: "5544444444444",
      isGroup: false
    });

    expect(contact.nameLocked).toBe(false);
  });

  it("should carry the lid-side locked name onto the survivor when merging", async () => {
    await Contact.create({
      name: "Number Side Name",
      number: "5555555555555",
      email: "",
      isGroup: false,
      nameLocked: false
    });

    await Contact.create({
      name: "Lid Side Name",
      lid: "lid-12345",
      email: "",
      isGroup: false,
      nameLocked: true
    });

    const contact = await CreateOrUpdateContactService({
      name: "Incoming WhatsApp Name",
      number: "5555555555555",
      lid: "lid-12345",
      isGroup: false
    });

    expect(contact.name).toBe("Lid Side Name");
    expect(contact.nameLocked).toBe(true);
  });
});
