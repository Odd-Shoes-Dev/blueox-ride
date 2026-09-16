-- Church Commission Tracking System
-- This migration adds support for tracking church referrals and commissions

-- 1. Create churches table
CREATE TABLE IF NOT EXISTS churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,  -- e.g., 'watoto', 'phaneroo'
  name TEXT NOT NULL,         -- e.g., 'Watoto Church'
  contact_email TEXT,
  contact_phone TEXT,
  mobile_money_number TEXT,   -- For payouts
  mobile_money_name TEXT,     -- Name on mobile money account
  is_active BOOLEAN DEFAULT true,
  total_commission_earned DECIMAL(12, 2) DEFAULT 0,
  total_commission_paid DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add church_id to bookings table
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS church_id UUID REFERENCES churches(id) ON DELETE SET NULL;

-- 3. Create church_commissions table
CREATE TABLE IF NOT EXISTS church_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  ride_price DECIMAL(10, 2) NOT NULL,      -- Original ride price
  booking_fee DECIMAL(10, 2) NOT NULL,     -- 10% booking fee
  commission_amount DECIMAL(10, 2) NOT NULL, -- 50% of booking fee (5% of ride price)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id),  -- Admin who marked as paid
  payment_reference TEXT,                   -- Mobile money reference
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Insert initial church data
INSERT INTO churches (slug, name) VALUES
  ('watoto', 'Watoto Church'),
  ('worshipharvest', 'Worship Harvest'),
  ('holycity', 'Holy City Church'),
  ('miraclecenter', 'Miracle Center Cathedral'),
  ('phaneroo', 'Phaneroo Ministries')
ON CONFLICT (slug) DO NOTHING;

-- 5. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookings_church_id ON bookings(church_id);
CREATE INDEX IF NOT EXISTS idx_church_commissions_church_id ON church_commissions(church_id);
CREATE INDEX IF NOT EXISTS idx_church_commissions_status ON church_commissions(status);

-- 6. Create view for church commission summary
CREATE OR REPLACE VIEW church_commission_summary AS
SELECT
  c.id,
  c.slug,
  c.name,
  c.contact_email,
  c.mobile_money_number,
  c.mobile_money_name,
  c.is_active,
  COUNT(DISTINCT cc.id) as total_bookings,
  COALESCE(SUM(cc.commission_amount), 0) as total_earned,
  COALESCE(SUM(CASE WHEN cc.status = 'paid' THEN cc.commission_amount ELSE 0 END), 0) as total_paid,
  COALESCE(SUM(CASE WHEN cc.status = 'pending' THEN cc.commission_amount ELSE 0 END), 0) as total_pending
FROM churches c
LEFT JOIN church_commissions cc ON c.id = cc.church_id
GROUP BY c.id, c.slug, c.name, c.contact_email, c.mobile_money_number, c.mobile_money_name, c.is_active;

-- 7. Function to create commission when booking is confirmed
CREATE OR REPLACE FUNCTION create_church_commission()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create commission if booking has a church_id and status is confirmed
  IF NEW.church_id IS NOT NULL AND NEW.status = 'confirmed' THEN
    -- Check if commission already exists for this booking
    IF NOT EXISTS (SELECT 1 FROM church_commissions WHERE booking_id = NEW.id) THEN
      -- Get the ride price
      DECLARE
        v_ride_price DECIMAL(10, 2);
        v_booking_fee DECIMAL(10, 2);
        v_commission DECIMAL(10, 2);
      BEGIN
        SELECT price INTO v_ride_price FROM rides WHERE id = NEW.ride_id;
        v_booking_fee := v_ride_price * 0.10;  -- 10% booking fee
        v_commission := v_booking_fee * 0.50;   -- 50% of booking fee goes to church

        INSERT INTO church_commissions (
          church_id,
          booking_id,
          ride_price,
          booking_fee,
          commission_amount
        ) VALUES (
          NEW.church_id,
          NEW.id,
          v_ride_price,
          v_booking_fee,
          v_commission
        );

        -- Update church total
        UPDATE churches
        SET total_commission_earned = total_commission_earned + v_commission,
            updated_at = NOW()
        WHERE id = NEW.church_id;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger for commission creation
DROP TRIGGER IF EXISTS trigger_create_church_commission ON bookings;
CREATE TRIGGER trigger_create_church_commission
  AFTER INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION create_church_commission();

-- 9. Function to mark commission as paid
CREATE OR REPLACE FUNCTION mark_commission_paid(
  p_commission_id UUID,
  p_admin_id UUID,
  p_payment_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_commission_amount DECIMAL(10, 2);
  v_church_id UUID;
BEGIN
  -- Get commission details
  SELECT commission_amount, church_id
  INTO v_commission_amount, v_church_id
  FROM church_commissions
  WHERE id = p_commission_id AND status = 'pending';

  IF v_commission_amount IS NULL THEN
    RETURN FALSE;  -- Commission not found or already paid
  END IF;

  -- Update commission status
  UPDATE church_commissions
  SET status = 'paid',
      paid_at = NOW(),
      paid_by = p_admin_id,
      payment_reference = p_payment_reference,
      notes = p_notes
  WHERE id = p_commission_id;

  -- Update church total paid
  UPDATE churches
  SET total_commission_paid = total_commission_paid + v_commission_amount,
      updated_at = NOW()
  WHERE id = v_church_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 10. RLS Policies
ALTER TABLE churches ENABLE ROW LEVEL SECURITY;
ALTER TABLE church_commissions ENABLE ROW LEVEL SECURITY;

-- Churches are readable by everyone
CREATE POLICY "Churches are viewable by everyone" ON churches
  FOR SELECT USING (true);

-- Only admins can modify churches
CREATE POLICY "Only admins can modify churches" ON churches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Commissions viewable by admins only
CREATE POLICY "Commissions viewable by admins" ON church_commissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Commissions can be created by the system (via trigger)
CREATE POLICY "System can create commissions" ON church_commissions
  FOR INSERT WITH CHECK (true);

-- Only admins can update commissions
CREATE POLICY "Only admins can update commissions" ON church_commissions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
