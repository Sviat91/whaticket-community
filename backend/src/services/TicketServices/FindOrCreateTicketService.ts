import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";

const FindOrCreateTicketService = async (
  contact: Contact,
  whatsappId: number,
  unreadMessages: number,
  groupContact?: Contact
): Promise<Ticket> => {
  const contactId = groupContact ? groupContact.id : contact.id;

  let ticket = await Ticket.findOne({
    where: { contactId, whatsappId },
    order: [["updatedAt", "DESC"]]
  });

  if (ticket) {
    await ticket.update({ status: "open", unreadMessages });
  } else {
    ticket = await Ticket.create({
      contactId,
      status: "open",
      isGroup: !!groupContact,
      unreadMessages,
      whatsappId
    });
  }

  ticket = await ShowTicketService(ticket.id);

  return ticket;
};

export default FindOrCreateTicketService;
