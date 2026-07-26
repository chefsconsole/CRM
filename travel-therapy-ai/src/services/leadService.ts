import { CustomerModel, type CustomerDoc } from "../db/models/index.js";

export interface InboundContact {
  name?: string;
  email?: string;
  phone?: string;
  platform: string;
  handle: string;
  city?: string;
}

/**
 * The anti-duplicate core of the CRM. Resolve an inbound contact to exactly one
 * customer by checking, in order: the (platform, handle) pair, then email, then
 * phone. Only create a new customer when nothing matches. Newly-learned
 * identifiers are merged onto the existing profile.
 */
export async function findOrCreateCustomer(
  contact: InboundContact
): Promise<CustomerDoc & { wasCreated: boolean }> {
  const or: Record<string, unknown>[] = [
    { handles: { $elemMatch: { platform: contact.platform, handle: contact.handle } } },
  ];
  if (contact.email) or.push({ email: contact.email.toLowerCase() });
  if (contact.phone) or.push({ phone: contact.phone });

  let customer = await CustomerModel.findOne({ $or: or });
  let wasCreated = false;

  if (!customer) {
    customer = await CustomerModel.create({
      name: contact.name,
      email: contact.email?.toLowerCase(),
      phone: contact.phone,
      city: contact.city,
      handles: [{ platform: contact.platform, handle: contact.handle }],
      lifecycle: "lead",
    });
    wasCreated = true;
  } else {
    // Merge any newly-learned identifiers onto the existing profile.
    let dirty = false;
    if (contact.name && !customer.name) {
      customer.name = contact.name;
      dirty = true;
    }
    if (contact.email && !customer.email) {
      customer.email = contact.email.toLowerCase();
      dirty = true;
    }
    if (contact.phone && !customer.phone) {
      customer.phone = contact.phone;
      dirty = true;
    }
    if (contact.city && !customer.city) {
      customer.city = contact.city;
      dirty = true;
    }
    const hasHandle = customer.handles.some(
      (h) => h.platform === contact.platform && h.handle === contact.handle
    );
    if (!hasHandle) {
      customer.handles.push({ platform: contact.platform as any, handle: contact.handle });
      dirty = true;
    }
    if (dirty) await customer.save();
  }

  return Object.assign(customer, { wasCreated });
}
