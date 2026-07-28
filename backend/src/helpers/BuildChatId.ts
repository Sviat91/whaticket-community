import Contact from "../models/Contact";

const BuildChatId = (contact: Contact, isGroup: boolean): string => {
  if (!contact.number && contact.lid) {
    return contact.lid.includes("@") ? contact.lid : `${contact.lid}@lid`;
  }
  return `${contact.number}@${isGroup ? "g" : "c"}.us`;
};

export default BuildChatId;
