import { Link } from 'react-router-dom'
import { LEGAL } from '@/domains/core/legal/legalConfig'
import { usePayments } from '@/shared/contexts/AppSettingsContext'
import {
  LegalLayout,
  LegalList,
  LegalLink,
  SupportEmail,
  type LegalSection,
} from '@/domains/core/legal/LegalLayout'

// While payments are switched off (see the app setting), the Service is free and nothing is
// paid through it; the text below follows that setting so it always matches what the app does.
function FeesContent() {
  const { paymentsEnabled } = usePayments()

  if (!paymentsEnabled) {
    return (
      <>
        <LegalList>
          <li>
            Booking a seat is <strong>free</strong>. We don't charge passengers or drivers a booking fee, and we don't
            process payments through the Service.
          </li>
          <li>
            The price on a ride is set by the driver. You pay the driver <strong>directly, in cash,</strong> after the
            ride. Any agreement about payment is between you and the driver.
          </li>
          <li>All prices are in Ugandan shillings (UGX).</li>
          <li>A booking is confirmed as soon as you make it, as long as seats are still available.</li>
        </LegalList>
        <p>
          We may introduce fees in future. If we do, we will tell you in the Service and update these Terms before they
          apply, and they will not apply to bookings made before then.
        </p>
      </>
    )
  }

  return (
    <>
      <LegalList>
        <li>
          To reserve a seat you pay a booking fee of {LEGAL.bookingFeePercent}% of the ride price per seat, online
          through mobile money. The amount is shown before you pay.
        </li>
        <li>You pay the remaining {100 - LEGAL.bookingFeePercent}% directly to the driver in cash after the ride.</li>
        <li>All prices are in Ugandan shillings (UGX).</li>
        <li>
          Online payments are handled by our payment provider, Pesapal, and your mobile money operator, and are also
          subject to their terms. Their charges, if any, are theirs.
        </li>
        <li>A booking is confirmed only once the booking fee has been paid successfully.</li>
      </LegalList>
      <p>
        A portion of the booking fee may be shared with a partner church if you arrived through that church's page.
        This does not change what you pay.
      </p>
    </>
  )
}

function CancellationsContent() {
  const { paymentsEnabled } = usePayments()

  if (!paymentsEnabled) {
    return (
      <>
        <p>Because nothing is paid through the Service, there are no refunds to process.</p>
        <LegalList>
          <li>
            <strong>Passengers</strong> can cancel a booking from My Rides. Please do it as early as you can, and tell
            the driver, so the seat can go to someone else.
          </li>
          <li>
            <strong>Drivers</strong> can cancel a ride from My Rides. Passengers who booked will see that it has been
            cancelled; please also contact them directly if you can.
          </li>
        </LegalList>
        <p>
          Repeatedly booking and not showing up, or cancelling at the last minute, can lead us to limit an account (see
          "Suspension and ending your account"). If a driver does not show up, or something else goes wrong, contact us at{' '}
          <SupportEmail />.
        </p>
      </>
    )
  }

  return (
    <>
      <LegalList>
        <li>
          <strong>Passenger cancels more than {LEGAL.freeCancellationHours} hour before departure:</strong> your
          booking fee is refunded to you.
        </li>
        <li>
          <strong>Passenger cancels {LEGAL.freeCancellationHours} hour or less before departure:</strong> the booking
          fee is not refunded to you and goes to the driver, to compensate for the lost seat.
        </li>
        <li>
          <strong>Driver cancels a ride:</strong> every confirmed passenger's booking fee is refunded.
        </li>
      </LegalList>
      <p>
        Refunds are sent back through the same payment provider and can take time to reach you. Cash paid to a driver
        is between you and the driver. If a driver does not show up, or something else goes wrong, contact us at{' '}
        <SupportEmail /> and we will help where we can.
      </p>
    </>
  )
}

const sections: LegalSection[] = [
  {
    id: 'acceptance',
    title: 'Agreeing to these terms',
    content: (
      <>
        <p>
          These Terms of Use ("Terms") are a contract between you and {LEGAL.serviceName} ("we", "us") covering your
          use of {LEGAL.website} and our web app (the "Service"). By creating an account or using the Service, you
          agree to these Terms and to our{' '}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          . If you do not agree, please do not use the Service.
        </p>
        <p>
          You must be at least {LEGAL.minimumAge} years old and able to enter into a binding contract to use the
          Service.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-do',
    title: 'What the Service is — and is not',
    content: (
      <>
        <p>
          {LEGAL.serviceName} is a platform that helps drivers with empty seats and passengers travelling the same
          way find each other and arrange shared journeys.
        </p>
        <p className="font-medium text-foreground">We are not a transport provider.</p>
        <LegalList>
          <li>We do not own or operate vehicles, employ drivers, or provide transport ourselves.</li>
          <li>
            Drivers are independent individuals. The journey is an arrangement between the driver and the passenger,
            and the driver is responsible for it.
          </li>
          <li>
            We do not guarantee that a ride will be available, that a driver or passenger will show up, or that any
            journey will go as planned.
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account',
    content: (
      <LegalList>
        <li>Give us accurate, current information, and keep it up to date (including your phone number).</li>
        <li>You may create an account with an email and password, or with Google. Keep your sign-in details private.</li>
        <li>You are responsible for everything that happens under your account. Tell us at once if you suspect misuse.</li>
        <li>One person, one account. Do not impersonate anyone or create accounts to get around a suspension.</li>
      </LegalList>
    ),
  },
  {
    id: 'drivers',
    title: 'If you offer rides (drivers)',
    content: (
      <>
        <p>By offering a ride you confirm and promise that:</p>
        <LegalList>
          <li>you hold a valid driving permit for the vehicle you are driving;</li>
          <li>the vehicle is roadworthy and legally registered, and has all the insurance the law requires;</li>
          <li>
            you have every licence and permit required by law for the journeys you offer, and you are allowed to carry
            passengers on the terms you advertise — you are solely responsible for meeting these legal requirements;
          </li>
          <li>your ride details (route, time, price, seats, vehicle information and photos) are accurate;</li>
          <li>you will follow Uganda's traffic and road-safety laws, and will not drive while impaired or distracted;</li>
          <li>you will only cancel a ride when you have to, and will do so as early as you can.</li>
        </LegalList>
        <p>
          You set your own price per seat. You collect what passengers owe you directly from them (see "Fees and payment").
        </p>
      </>
    ),
  },
  {
    id: 'passengers',
    title: 'If you book or request rides (passengers)',
    content: (
      <LegalList>
        <li>Be at the pickup point on time, and tell the driver early if your plans change.</li>
        <li>Book only the seats you need, and treat the driver, the vehicle and other passengers with respect.</li>
        <li>Follow the driver's reasonable safety instructions, such as wearing a seat belt.</li>
        <li>
          <strong>Ride requests:</strong> you can post a request with your route, seats and budget. A driver may accept
          it, which creates a booking for you. Any negotiation beyond that happens between you and the driver, outside
          the Service, and we are not a party to it.
        </li>
        <li>
          <strong>Booking requests:</strong> instead of booking instantly, you can ask a driver for a seat with your own
          pickup, drop-off and offer. The driver may accept or refuse. You can send up to 3 requests on the same ride,
          and each new request after a refusal must change something (your offer, seats, or stops). A driver may also
          stop further requests from someone on their ride.
        </li>
      </LegalList>
    ),
  },
  {
    id: 'fees',
    title: 'Fees and payment',
    content: <FeesContent />,
  },
  {
    id: 'cancellations',
    title: 'Cancellations and refunds',
    content: <CancellationsContent />,
  },
  {
    id: 'safety',
    title: 'Safety',
    content: (
      <>
        <p>
          Sharing a car with someone you do not know carries risk. We give you tools such as ratings, reviews and live
          location sharing, but we do not screen every user, and you use the Service at your own risk. Use your
          judgement:
        </p>
        <LegalList>
          <li>check the driver's rating, reviews and vehicle details before you book;</li>
          <li>confirm the driver and car match the booking before you get in;</li>
          <li>tell someone you trust your route and expected arrival time;</li>
          <li>never get into a vehicle or stay in one if you feel unsafe.</li>
        </LegalList>
        <p>
          In an emergency, call the police on <strong>999</strong> or <strong>112</strong> first, then tell us.
        </p>
      </>
    ),
  },
  {
    id: 'conduct',
    title: 'Acceptable use',
    content: (
      <>
        <p>You agree not to:</p>
        <LegalList>
          <li>break any law, or use the Service for anything unlawful;</li>
          <li>harass, threaten, discriminate against or endanger anyone;</li>
          <li>post false, misleading or fraudulent rides, requests, reviews or profile information;</li>
          <li>make fake bookings or abuse payments and refunds, including disputing valid payments in bad faith;</li>
          <li>collect other users' information for any purpose outside arranging a shared journey;</li>
          <li>copy, scrape, reverse-engineer or interfere with the Service, or try to break its security.</li>
        </LegalList>
      </>
    ),
  },
  {
    id: 'content',
    title: 'Reviews and your content',
    content: (
      <>
        <p>
          Reviews and ratings should be honest, fair and based on your own experience. Do not post anything unlawful,
          abusive, defamatory or private about another person. We may remove content that breaks these Terms.
        </p>
        <p>
          You keep ownership of what you post (such as photos, ride details and reviews). You give us a non-exclusive,
          worldwide, royalty-free licence to store, display and use it as needed to run and improve the Service. You
          confirm you have the right to post it.
        </p>
      </>
    ),
  },
  {
    id: 'ip',
    title: 'Our rights and third-party services',
    content: (
      <>
        <p>
          The Service, including its name, logo, design and software, belongs to us or our licensors and is protected
          by law. You may use it as these Terms allow, but you may not copy or resell it.
        </p>
        <p>
          The Service relies on third parties, including maps and place data. Map data ©{' '}
          <LegalLink href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</LegalLink> and map
          imagery from MapTiler. Sign-in with Google is subject to{' '}
          <LegalLink href="https://policies.google.com/terms">Google's Terms of Service</LegalLink>. Maps, routes and
          distances are estimates and may be wrong.
        </p>
      </>
    ),
  },
  {
    id: 'disclaimers',
    title: 'What we do not promise',
    content: (
      <p>
        The Service is provided "as is" and "as available". To the extent the law allows, we do not promise that it
        will always work, be free of errors, or be uninterrupted, and we do not give any warranty about the conduct,
        identity, vehicles or reliability of drivers and passengers, or about the accuracy of the information they
        post.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Limits on our responsibility',
    content: (
      <>
        <p>To the fullest extent the law allows:</p>
        <LegalList>
          <li>
            we are not responsible for the acts or omissions of drivers, passengers or other users, or for accidents,
            injury, death, loss or damage that happen during or because of a journey arranged through the Service;
          </li>
          <li>
            we are not liable for indirect or consequential loss, or for loss of profit, income or opportunity;
          </li>
          <li>
            our total liability to you for any claim connected to the Service is limited to the amounts you paid to
            us in the 12 months before the claim arose (which may be nothing, while the Service is free).
          </li>
        </LegalList>
        <p>
          Nothing in these Terms limits liability that cannot lawfully be limited, or affects any consumer rights you
          have under Ugandan law that cannot be waived.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: 'Your responsibility to us',
    content: (
      <p>
        You agree to cover reasonable losses and costs we suffer because you broke these Terms or the law, or because
        of your content or conduct — for example, a claim brought against us over a journey you offered without the
        required licence or insurance.
      </p>
    ),
  },
  {
    id: 'ending',
    title: 'Suspension and ending your account',
    content: (
      <>
        <p>
          You can stop using the Service and ask us to delete your account at any time by emailing <SupportEmail />.
          Outstanding bookings and any amounts owed remain subject to these Terms.
        </p>
        <p>
          We may suspend or close an account, or remove content, if we reasonably believe someone has broken these
          Terms, put others at risk, or misused the Service, or if the law requires it. Where we reasonably can, we
          will tell you why.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to the Service or these Terms',
    content: (
      <p>
        We may change or discontinue parts of the Service, and we may update these Terms. When we make an important
        change, we will update the date above and, where appropriate, tell you in the Service or by email. If you keep
        using the Service after a change takes effect, you accept the updated Terms.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'Governing law and disputes',
    content: (
      <>
        <p>
          These Terms are governed by the laws of Uganda, and the courts of Uganda have jurisdiction over any dispute,
          subject to any rights you have that cannot be excluded.
        </p>
        <p>
          If you have a problem, please contact us first at <SupportEmail /> — most issues can be sorted out quickly
          without going further.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    content: (
      <p>
        {LEGAL.serviceName}, {LEGAL.location} · <SupportEmail />
      </p>
    ),
  },
]

export default function TermsPage() {
  const { paymentsEnabled } = usePayments()

  return (
    <LegalLayout
      title="Terms of Use"
      path="/terms"
      seoDescription="The terms that apply when you use Blue OX Rides to offer or book shared rides in Uganda, including fees, cancellations and safety."
      summary={
        paymentsEnabled ? (
          <>
            <p>
              Blue OX Rides connects drivers and passengers — we are not a transport company, and drivers are
              independent. You pay a {LEGAL.bookingFeePercent}% booking fee online to reserve a seat and the rest in cash
              to the driver.
            </p>
            <p>
              Cancel more than {LEGAL.freeCancellationHours} hour ahead for a refund of your fee; drivers who cancel
              refund everyone. Be honest, be respectful, and use your judgement on safety — drivers must hold every
              licence and insurance the law requires.
            </p>
          </>
        ) : (
          <>
            <p>
              Blue OX Rides connects drivers and passengers — we are not a transport company, and drivers are
              independent. Booking is currently <strong>free</strong>: there is no booking fee, and you pay the driver
              the ride price directly in cash.
            </p>
            <p>
              Please cancel early if your plans change. Be honest, be respectful, and use your judgement on safety —
              drivers must hold every licence and insurance the law requires.
            </p>
          </>
        )
      }
      sections={sections}
      related={{ to: '/privacy', label: 'Read our Privacy Policy' }}
    />
  )
}
