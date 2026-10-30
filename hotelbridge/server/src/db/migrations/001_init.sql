-- HotelBridge Global — initial schema.
-- Conventions:
--   * Money is stored as BIGINT minor units (cents) with an explicit ISO-4217 currency column.
--   * FX rates are stored as BIGINT scaled by 1e8 with the source and timestamp they were recorded at.
--   * Financial journals (ledger_entries) are append-only; corrections are reversals, never edits.

CREATE TABLE agencies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  legal_name        text,
  country_code      char(2) NOT NULL,
  city              text,
  address           text,
  phone             text,
  website           text,
  registration_number text,
  tax_id            text,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','suspended','rejected')),
  verified_at       timestamptz,
  verified_by       uuid,
  selling_currency  char(3) NOT NULL DEFAULT 'EUR',
  -- Credit is OFF unless explicitly approved by a finance/admin user.
  credit_enabled    boolean NOT NULL DEFAULT false,
  credit_limit_minor bigint NOT NULL DEFAULT 0 CHECK (credit_limit_minor >= 0),
  credit_approved_by uuid,
  credit_approved_at timestamptz,
  payment_terms     text NOT NULL DEFAULT 'prepay' CHECK (payment_terms IN ('prepay','credit')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hotels (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE,
  name              text NOT NULL,
  city              text NOT NULL,
  country_code      char(2) NOT NULL,
  address           text,
  latitude          numeric(9,6),
  longitude         numeric(9,6),
  star_rating       numeric(2,1),
  star_rating_verified boolean NOT NULL DEFAULT false,
  collections       text[] NOT NULL DEFAULT '{}',
  summary           text,
  description       text,
  facilities        text[] NOT NULL DEFAULT '{}',
  content_verified  boolean NOT NULL DEFAULT false,
  transport_notes   text,
  check_in_time     text,
  check_out_time    text,
  inclusion_rationale text,          -- internal: the commercial reason this hotel is in the collection
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','paused')),
  is_sample         boolean NOT NULL DEFAULT false,  -- demo/sample content, never a real contracted property
  partner_contact_email text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hotels_city_idx ON hotels (lower(city));

CREATE TABLE hotel_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id   uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  url        text NOT NULL,
  caption    text,
  credit     text NOT NULL,          -- photographer / owner
  license    text NOT NULL,          -- licence or written permission reference
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE room_types (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id     uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  code         text NOT NULL,
  name         text NOT NULL,
  description  text,
  max_adults   int NOT NULL CHECK (max_adults >= 1),
  max_children int NOT NULL DEFAULT 0 CHECK (max_children >= 0),
  max_occupancy int NOT NULL CHECK (max_occupancy >= 1),
  bed_configuration text,
  size_sqm     int,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  UNIQUE (hotel_id, code)
);

-- Mapping of a catalogue hotel / room to an external inventory source's identifiers.
CREATE TABLE source_mappings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id      uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id  uuid REFERENCES room_types(id) ON DELETE CASCADE,
  source        text NOT NULL,
  external_id   text NOT NULL,
  UNIQUE (source, external_id)
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid REFERENCES agencies(id),
  hotel_id      uuid REFERENCES hotels(id),
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN
                  ('agency_admin','agency_agent','hb_admin','hb_ops','hb_finance','hotel_partner')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((role IN ('agency_admin','agency_agent')) = (agency_id IS NOT NULL)),
  CHECK ((role = 'hotel_partner') = (hotel_id IS NOT NULL))
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  csrf_token  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  actor_user_id uuid,
  agency_id    uuid,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  action       text NOT NULL,
  details      jsonb NOT NULL DEFAULT '{}',
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------- contracts
CREATE TABLE contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid NOT NULL REFERENCES hotels(id),
  reference       text NOT NULL UNIQUE,
  source          text NOT NULL DEFAULT 'direct_contract',
  rate_model      text NOT NULL CHECK (rate_model IN ('net','commissionable')),
  commission_bps  int NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000),
  currency        char(3) NOT NULL,
  valid_from      date NOT NULL,
  valid_to        date NOT NULL,
  -- instant: HotelBridge holds an allocation and may confirm without asking the hotel.
  -- request: every booking needs the hotel's explicit confirmation.
  booking_mode    text NOT NULL DEFAULT 'request' CHECK (booking_mode IN ('instant','request')),
  release_days    int NOT NULL DEFAULT 0 CHECK (release_days >= 0),
  tax_policy      jsonb NOT NULL DEFAULT '{"includedInRate":true}',
  cancellation_policy jsonb NOT NULL,
  payment_terms   text,
  distribution    jsonb NOT NULL DEFAULT '{"b2bAgencies":true,"markets":[],"notes":""}',
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','pending_approval','active','suspended','expired')),
  version         int NOT NULL DEFAULT 1,
  internal_notes  text,
  documents       jsonb NOT NULL DEFAULT '[]',
  created_by      uuid,
  approved_by     uuid,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to > valid_from)
);

CREATE TABLE contract_versions (
  id          bigserial PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version     int NOT NULL,
  snapshot    jsonb NOT NULL,
  change_note text,
  changed_by  uuid,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, version)
);

-- A rate: price per room per night for a room type, adult occupancy and meal plan over a date range.
CREATE TABLE rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  room_type_id  uuid NOT NULL REFERENCES room_types(id),
  meal_plan     text NOT NULL CHECK (meal_plan IN ('RO','BB','HB','FB','AI')),
  adults        int NOT NULL CHECK (adults >= 1),
  date_from     date NOT NULL,
  date_to       date NOT NULL,          -- inclusive last night
  amount_minor  bigint NOT NULL CHECK (amount_minor > 0),
  child_amount_minor bigint NOT NULL DEFAULT 0 CHECK (child_amount_minor >= 0),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);
CREATE INDEX rates_lookup_idx ON rates (contract_id, room_type_id, meal_plan, adults);

CREATE TABLE restrictions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  room_type_id uuid REFERENCES room_types(id),
  kind         text NOT NULL CHECK (kind IN ('min_stay','stop_sell','blackout','supplement')),
  date_from    date NOT NULL,
  date_to      date NOT NULL,
  value        bigint,                  -- nights for min_stay; minor units per room-night for supplement
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);

CREATE TABLE allocations (
  contract_id  uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES room_types(id),
  stay_date    date NOT NULL,
  allotted     int NOT NULL CHECK (allotted >= 0),
  sold         int NOT NULL DEFAULT 0 CHECK (sold >= 0),
  PRIMARY KEY (contract_id, room_type_id, stay_date),
  CHECK (sold <= allotted)
);

-- ---------------------------------------------------------------- pricing & fx
CREATE TABLE pricing_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid REFERENCES agencies(id),   -- NULL = network default
  source      text,                           -- NULL = all sources
  markup_type text NOT NULL CHECK (markup_type IN ('percent','fixed_per_room_night')),
  value       bigint NOT NULL CHECK (value >= 0), -- bps for percent, minor units for fixed
  currency    char(3),                        -- required for fixed markups
  rounding    text NOT NULL DEFAULT 'none' CHECK (rounding IN ('none','up_to_unit')),
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (markup_type <> 'fixed_per_room_night' OR currency IS NOT NULL)
);

CREATE TABLE fx_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base        char(3) NOT NULL,
  quote       char(3) NOT NULL,
  rate_scaled bigint NOT NULL CHECK (rate_scaled > 0),  -- 1 base = rate_scaled / 1e8 quote
  source      text NOT NULL,
  as_of       timestamptz NOT NULL,
  recorded_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fx_lookup_idx ON fx_rates (base, quote, as_of DESC);

-- ---------------------------------------------------------------- search & offers
CREATE TABLE searches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES agencies(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  destination text NOT NULL,
  check_in    date NOT NULL,
  check_out   date NOT NULL,
  rooms       jsonb NOT NULL,
  filters     jsonb NOT NULL DEFAULT '{}',
  result_count int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Offers are server-side snapshots. Checkout references an offer id; prices never come from the browser.
CREATE TABLE offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id    uuid REFERENCES searches(id),
  agency_id    uuid NOT NULL REFERENCES agencies(id),
  hotel_id     uuid NOT NULL REFERENCES hotels(id),
  source       text NOT NULL,
  payload      jsonb NOT NULL,
  total_sell_minor bigint NOT NULL,
  currency     char(3) NOT NULL,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE saved_hotels (
  agency_id uuid NOT NULL REFERENCES agencies(id),
  user_id   uuid NOT NULL REFERENCES users(id),
  hotel_id  uuid NOT NULL REFERENCES hotels(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hotel_id)
);

-- ---------------------------------------------------------------- bookings
CREATE TABLE bookings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference          text NOT NULL UNIQUE,
  agency_id          uuid NOT NULL REFERENCES agencies(id),
  created_by         uuid NOT NULL REFERENCES users(id),
  hotel_id           uuid NOT NULL REFERENCES hotels(id),
  offer_id           uuid REFERENCES offers(id),
  source             text NOT NULL,
  contract_id        uuid REFERENCES contracts(id),
  status             text NOT NULL CHECK (status IN (
                       'awaiting_payment','submitting','pending_confirmation','confirmed',
                       'amendment_requested','cancellation_requested','cancelled','failed',
                       'refund_pending','refunded')),
  needs_reconciliation boolean NOT NULL DEFAULT false,
  allocation_held    boolean NOT NULL DEFAULT false,
  check_in           date NOT NULL,
  check_out          date NOT NULL,
  nights             int NOT NULL CHECK (nights > 0),
  currency           char(3) NOT NULL,            -- currency the agency is charged in
  total_sell_minor   bigint NOT NULL CHECK (total_sell_minor >= 0),
  supplier_currency  char(3) NOT NULL,
  supplier_cost_minor bigint NOT NULL CHECK (supplier_cost_minor >= 0), -- in supplier currency
  supplier_cost_converted_minor bigint NOT NULL,  -- in booking currency at the recorded FX
  fx_rate_id         uuid REFERENCES fx_rates(id),
  fx_rate_scaled     bigint,
  pricing            jsonb NOT NULL,              -- full auditable breakdown from the pricing engine
  cancellation_policy jsonb NOT NULL,
  free_cancellation_until timestamptz,            -- NULL = non-refundable
  payment_due_at     timestamptz,
  payment_method     text NOT NULL CHECK (payment_method IN ('prepay','credit')),
  idempotency_key    text NOT NULL,
  supplier_reference text,
  hotel_confirmation_number text,
  lead_guest_name    text NOT NULL,
  agent_reference    text,
  special_requests   text,
  failure_reason     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  confirmed_at       timestamptz,
  cancelled_at       timestamptz,
  UNIQUE (agency_id, idempotency_key),
  CHECK (check_out > check_in)
);
CREATE INDEX bookings_agency_idx ON bookings (agency_id, created_at DESC);
CREATE INDEX bookings_status_idx ON bookings (status);

CREATE TABLE booking_rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  room_index    int NOT NULL,
  room_type_id  uuid REFERENCES room_types(id),
  room_name     text NOT NULL,
  meal_plan     text NOT NULL,
  adults        int NOT NULL,
  children_ages int[] NOT NULL DEFAULT '{}',
  guests        jsonb NOT NULL,
  sell_minor    bigint NOT NULL,
  supplier_cost_minor bigint NOT NULL,
  UNIQUE (booking_id, room_index)
);

CREATE TABLE booking_events (
  id           bigserial PRIMARY KEY,
  booking_id   uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status  text,
  to_status    text NOT NULL,
  actor_user_id uuid,
  note         text,
  at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supplier_calls (
  id           bigserial PRIMARY KEY,
  source       text NOT NULL,
  operation    text NOT NULL,
  booking_id   uuid,
  request      jsonb,
  response     jsonb,
  outcome      text NOT NULL CHECK (outcome IN ('success','error','timeout','circuit_open')),
  error_class  text,
  duration_ms  int NOT NULL,
  at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- finance
CREATE TABLE invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number       text NOT NULL UNIQUE,
  agency_id    uuid NOT NULL REFERENCES agencies(id),
  booking_id   uuid REFERENCES bookings(id),
  kind         text NOT NULL DEFAULT 'invoice' CHECK (kind IN ('invoice','credit_note')),
  currency     char(3) NOT NULL,
  amount_minor bigint NOT NULL,
  status       text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','paid','void')),
  issued_at    timestamptz NOT NULL DEFAULT now(),
  due_at       timestamptz
);

CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL REFERENCES agencies(id),
  booking_id   uuid REFERENCES bookings(id),
  direction    text NOT NULL CHECK (direction IN ('received','refunded')),
  method       text NOT NULL CHECK (method IN ('bank_transfer','payment_provider','credit_account','other')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency     char(3) NOT NULL,
  external_reference text,
  received_at  timestamptz NOT NULL,
  recorded_by  uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Double-entry journal. Every journal_id balances to zero per currency (enforced in code + tests).
-- Accounts: agent_receivable, supplier_payable, net_revenue, cash
CREATE TABLE ledger_entries (
  id           bigserial PRIMARY KEY,
  journal_id   uuid NOT NULL,
  booking_id   uuid REFERENCES bookings(id),
  agency_id    uuid REFERENCES agencies(id),
  account      text NOT NULL CHECK (account IN ('agent_receivable','supplier_payable','net_revenue','cash')),
  amount_minor bigint NOT NULL,   -- positive = debit, negative = credit
  currency     char(3) NOT NULL,
  kind         text NOT NULL,     -- booking_confirmed | booking_cancelled | cancellation_fee | payment | refund | reversal | adjustment
  memo         text,
  reverses_journal_id uuid,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_booking_idx ON ledger_entries (booking_id);

CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; record a reversal or adjustment instead', TG_TABLE_NAME;
END $$;
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER payments_immutable BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------- group desk
CREATE TABLE group_enquiries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text NOT NULL UNIQUE,
  agency_id       uuid NOT NULL REFERENCES agencies(id),
  created_by      uuid NOT NULL REFERENCES users(id),
  title           text NOT NULL,
  status          text NOT NULL DEFAULT 'new' CHECK (status IN (
                    'new','under_review','sent_to_hotels','offers_received','proposal_prepared',
                    'sent_to_agent','negotiation','won','lost','cancelled')),
  group_type      text NOT NULL CHECK (group_type IN ('leisure','corporate','mice','tour_series','other')),
  legs            jsonb NOT NULL,      -- [{city, checkIn, checkOut}]
  total_passengers int NOT NULL CHECK (total_passengers > 0),
  rooming         jsonb NOT NULL,      -- {single, double, twin, triple, family}
  hotel_category  text,
  meal_plan       text,
  budget_minor    bigint,
  budget_currency char(3),
  coach_parking   boolean NOT NULL DEFAULT false,
  accessibility   text,
  special_requests text,
  quote_needed_by date NOT NULL,
  target_response_at timestamptz NOT NULL,
  assigned_to     uuid REFERENCES users(id),
  outcome_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_hotel_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id    uuid NOT NULL REFERENCES group_enquiries(id) ON DELETE CASCADE,
  hotel_id      uuid REFERENCES hotels(id),
  hotel_name    text NOT NULL,
  contact_email text,
  subject       text NOT NULL,
  body          text NOT NULL,
  -- 'drafted' means generated only. It becomes 'sent' only when a user records that it was sent.
  status        text NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted','sent','responded','declined','no_response')),
  sent_via      text CHECK (sent_via IN ('manual_email','email_integration')),
  sent_at       timestamptz,
  sent_by       uuid,
  respond_by    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_offers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id     uuid NOT NULL REFERENCES group_enquiries(id) ON DELETE CASCADE,
  hotel_request_id uuid REFERENCES group_hotel_requests(id),
  hotel_name     text NOT NULL,
  city           text NOT NULL,
  check_in       date NOT NULL,
  check_out      date NOT NULL,
  currency       char(3) NOT NULL,
  lines          jsonb NOT NULL,     -- [{roomType, rooms, nightlyNetMinor}]
  meal_plan      text,
  taxes_minor    bigint NOT NULL DEFAULT 0,
  net_total_minor bigint NOT NULL,
  cancellation_terms text NOT NULL,
  payment_terms  text NOT NULL,
  conditions     text,
  valid_until    date NOT NULL,
  recorded_by    uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_proposals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id     uuid NOT NULL REFERENCES group_enquiries(id) ON DELETE CASCADE,
  version        int NOT NULL,
  currency       char(3) NOT NULL,
  options        jsonb NOT NULL,     -- built only from recorded offers
  total_net_minor bigint NOT NULL,
  total_sell_minor bigint NOT NULL,
  markup_bps     int NOT NULL,
  valid_until    date NOT NULL,
  exclusions     text,
  notes          text,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined','superseded')),
  created_by     uuid NOT NULL,
  sent_at        timestamptz,
  responded_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enquiry_id, version)
);

CREATE TABLE group_messages (
  id           bigserial PRIMARY KEY,
  enquiry_id   uuid NOT NULL REFERENCES group_enquiries(id) ON DELETE CASCADE,
  author_user_id uuid,
  visibility   text NOT NULL CHECK (visibility IN ('agent','internal')),
  body         text NOT NULL,
  at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- partners & support
CREATE TABLE partner_applications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('hotel','distribution')),
  organisation text NOT NULL,
  contact_name text NOT NULL,
  email        text NOT NULL,
  phone        text,
  country_code char(2),
  city         text,
  website      text,
  details      jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','approved','declined')),
  review_notes text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_tickets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference  text NOT NULL UNIQUE,
  agency_id  uuid NOT NULL REFERENCES agencies(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  booking_id uuid REFERENCES bookings(id),
  subject    text NOT NULL,
  priority   text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_messages (
  id         bigserial PRIMARY KEY,
  ticket_id  uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  from_staff boolean NOT NULL,
  body       text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE reference_seq START 100001;
