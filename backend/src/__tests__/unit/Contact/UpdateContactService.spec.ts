import Contact from "../../../models/Contact";
import UpdateContactService from "../../../services/ContactServices/UpdateContactService";
import { disconnect, truncate } from "../../utils/database";

describe("UpdateContactService", () => {
  beforeEach(async () => {
    await truncate();
  });

  afterEach(async () => {
    await truncate();
  });

  afterAll(async () => {
    await disconnect();
  });

  it("should lock the name when the caller changes it", async () => {
    const existing = await Contact.create({
      name: "Old Name",
      number: "5566666666666",
      email: "",
      isGroup: false,
      nameLocked: false
    });

    const contact = await UpdateContactService({
      contactData: { name: "New Name" },
      contactId: String(existing.id)
    });

    expect(contact.name).toBe("New Name");
    expect(contact.nameLocked).toBe(true);
  });

  it("should leave nameLocked untouched when the name is not changed", async () => {
    const existing = await Contact.create({
      name: "Same Name",
      number: "5577777777777",
      email: "old@example.com",
      isGroup: false,
      nameLocked: false
    });

    const contact = await UpdateContactService({
      contactData: { email: "new@example.com" },
      contactId: String(existing.id)
    });

    expect(contact.email).toBe("new@example.com");
    expect(contact.nameLocked).toBe(false);
  });
});
