import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";

const FindOrCreateTicketService = async (
  contact: Contact,
  whatsappId: number,
  fromMe: boolean,
  groupContact?: Contact
): Promise<Ticket> => {
  const contactId = groupContact ? groupContact.id : contact.id;

  let ticket = await Ticket.findOne({
    where: { contactId },
    order: [["updatedAt", "DESC"]]
  });

  if (ticket) {
    const newUnread = fromMe ? 0 : ticket.unreadMessages + 1;
    await ticket.update({ status: "open", unreadMessages: newUnread, whatsappId });
  } else {
    ticket = await Ticket.create({
      contactId,
      status: "open",
      isGroup: !!groupContact,
      unreadMessages: fromMe ? 0 : 1,
      whatsappId
    });
  }

  ticket = await ShowTicketService(ticket.id);

  return ticket;
};

export default FindOrCreateTicketService;
