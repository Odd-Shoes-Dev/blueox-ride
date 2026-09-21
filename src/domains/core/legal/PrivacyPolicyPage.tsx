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

// Payments are switched off while the Service is free (see the app setting). These bits of the
// policy follow it, so the policy always describes what the app actually does.
function PaymentInfoNote() {
  const { paymentsEnabled } = usePayments()

  if (!paymentsEnabled) {
    return (
      <>
        <p className="font-medium text-foreground pt-2">Payments</p>
        <p>
          Blue OX Rides does not currently take payments: you pay the driver directly, in cash. We therefore do not
          collect payment card or mobile money details.
        </p>
      </>
    )
  }

  return (
    <>
      <p className="font-medium text-foreground pt-2">Payment information</p>
      <p>
        When you pay a booking fee by mobile money, we record the amount, the mobile money phone number you paid from,
        the payment status and the reference numbers from our payment provider. We never see or store your mobile money
        PIN or card details — those are handled by the payment provider and your mobile money operator.
      </p>
    </>
  )
}

function ProcessBookingsUse() {
  const { paymentsEnabled } = usePayments()
  return (
    <>
      Show rides, match passengers with drivers, and process bookings
      {paymentsEnabled ? ', payments and refunds' : ''}.
    </>
  )
}

function PesapalItem() {
  const { paymentsEnabled } = usePayments()
  if (!paymentsEnabled) return null
  return (
    <li>
      <strong>Pesapal</strong> — processes mobile money payments and refunds. Receives the amount, your mobile money
      number and payment references.
    </li>
  )
}

const sections: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are and what this covers',
    content: (
      <>
        <p>
          {LEGAL.serviceName} ("we", "us") runs a carpooling platform in Uganda at {LEGAL.website}, available as a
          website and an installable web app (the "Service"). It helps drivers who have empty seats connect with
          passengers travelling the same way.
        </p>
        <p>
          This policy explains what personal information we collect, why we collect it, who we share it with, and
          the choices and rights you have. It applies to everyone who uses the Service, whether you are a passenger,
          a driver, or just browsing. We handle personal data in line with the Data Protection and Privacy Act, 2019
          of Uganda.
        </p>
        <p>
          We are the data controller for the information described here. You can reach us at <SupportEmail /> or by
          post in {LEGAL.location}.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'Information we collect',
    content: (
      <>
        <p className="font-medium text-foreground">Information you give us</p>
        <LegalList>
          <li>
            <strong>Account details:</strong> your name, email address, password, phone number and profile photo.
            Passwords are stored in hashed form by our authentication provider; we cannot read them.
          </li>
          <li>
            <strong>Your agreement:</strong> when you agreed to the Terms of Use and this Privacy Policy, and which
            version, so we can show that you did.
          </li>
          <li>
            <strong>Driver details:</strong> vehicle information and photos of your car, and the rides you offer
            (route, departure time, price per seat and number of seats).
          </li>
          <li>
            <strong>Passenger activity:</strong> your bookings, the ride requests you post (route, seats and
            budget), and cancellations.
          </li>
          <li>
            <strong>Ratings and reviews</strong> you write about other users, and those written about you.
          </li>
          <li>
            <strong>Messages to us</strong> when you contact support, and anything you include in them.
          </li>
        </LegalList>
        <PaymentInfoNote />
        <p className="font-medium text-foreground pt-2">Location information</p>
        <LegalList>
          <li>
            <strong>Your device location</strong>, if you allow it in your browser. We use it to centre the map on
            you, suggest your pickup point and let you tap "use my location". We do not keep a history of it. It is
            saved only if you choose it as the pickup or destination of a ride or request you post.
          </li>
          <li>
            <strong>Live driver location.</strong> If you are a driver and start a trip with location sharing,
            your position is sent in real time to passengers with a confirmed booking on that ride. We confirm with
            you each time you start a trip. It is sent over a private channel that only you and those passengers can
            join, it is relayed live and is <strong>not stored</strong> in our database. It stops when you end the
            trip.
          </li>
          <li>
            <strong>Places you search or pick</strong> on the map. The text you type and the map position are sent
            to our map and place-search providers (see "Who we share information with") to return results.
          </li>
        </LegalList>
        <p className="font-medium text-foreground pt-2">If you continue with Google</p>
        <p>
          We receive your name, email address and profile picture from your Google account, and Google's confirmation
          that the account is yours. We do not receive your Google password.
        </p>
        <p className="font-medium text-foreground pt-2">Technical information</p>
        <p>
          Like most websites, our servers and providers automatically receive your IP address, browser and device
          type, and basic request logs. We use these to keep the Service running, secure it and fix problems.
        </p>
        <p className="font-medium text-foreground pt-2">Church referrals</p>
        <p>
          If you arrive through a partner church's page, we remember which church referred you for 30 days so a
          booking you make can be credited to that church. Partner churches do not get access to your account.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use your information',
    content: (
      <>
        <LegalList>
          <li>Create and secure your account and sign you in.</li>
          <li>
            <ProcessBookingsUse />
          </li>
          <li>Let drivers and passengers contact each other once a booking is confirmed.</li>
          <li>Show maps, routes and live driver position.</li>
          <li>Display ratings and reviews so people can decide whom to travel with.</li>
          <li>Send service messages, such as booking confirmations and important account notices.</li>
          <li>Prevent fraud, abuse and misuse, keep the Service safe and enforce our <Link to="/terms" className="text-primary hover:underline">Terms of Use</Link>.</li>
          <li>Provide support, and understand and fix problems with the Service.</li>
          <li>Meet legal, accounting and regulatory obligations.</li>
        </LegalList>
        <p>
          We only process your personal data where we have a lawful basis under Ugandan law: your consent, because it
          is needed to provide the Service you asked for, because the law requires it, or for legitimate interests
          such as safety and fraud prevention that do not override your rights. Where we rely on consent (for
          example, your device location), you can withdraw it at any time.
        </p>
        <p>We do not sell your personal data, and we do not use it for advertising.</p>
      </>
    ),
  },
  {
    id: 'what-others-see',
    title: 'What other users can see',
    content: (
      <>
        <p>Carpooling only works if people can see enough about each other to decide whether to travel together.</p>
        <LegalList>
          <li>
            <strong>Public to other users:</strong> your name, profile photo, rating and the reviews written about
            you. Rides you offer (route, time, price, seats, vehicle details) and ride requests you post are visible
            to others using the Service.
          </li>
          <li>
            <strong>After a booking is confirmed:</strong> the driver and the passenger can see each other's contact
            details, such as phone number, so they can arrange pickup.
          </li>
          <li>
            <strong>During a trip:</strong> passengers with a confirmed booking can see the driver's live position if
            the driver has turned sharing on.
          </li>
        </LegalList>
        <p>
          Only share what you are comfortable with. Do not put sensitive personal information in reviews or ride
          descriptions.
        </p>
      </>
    ),
  },
  {
    id: 'who-we-share-with',
    title: 'Who we share information with',
    content: (
      <>
        <p>
          We use trusted companies to run the Service. They may process your data only to provide their service to
          us, under their own security and privacy commitments:
        </p>
        <LegalList>
          <li>
            <strong>Supabase</strong> — our database, sign-in, file storage and real-time messaging. Holds your
            account, rides, bookings and uploaded photos.
          </li>
          <PesapalItem />
          <li>
            <strong>Google</strong> — only if you choose "Continue with Google". Google's own{' '}
            <LegalLink href="https://policies.google.com/privacy">Privacy Policy</LegalLink> applies to your Google
            account.
          </li>
          <li>
            <strong>MapTiler</strong> — provides the map images and place search. Receives the text you search, the
            area of the map you are viewing, and your IP address.
          </li>
          <li>
            <strong>OpenStreetMap-based services</strong> (Nominatim and OSRM) — used as a fallback for address
            lookup and for drawing road routes. Receive the coordinates involved and your IP address. Map data ©{' '}
            <LegalLink href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</LegalLink>.
          </li>
        </LegalList>
        <p>We may also disclose information:</p>
        <LegalList>
          <li>
            when required by law, a court order or a lawful request from a public authority, or to protect the safety
            and rights of our users, the public or ourselves;
          </li>
          <li>
            in connection with a merger, acquisition or sale of our business, in which case we will make sure the
            new owner respects this policy.
          </li>
        </LegalList>
      </>
    ),
  },
  {
    id: 'transfers',
    title: 'Transfers outside Uganda',
    content: (
      <p>
        Some of the providers above store or process data on servers outside Uganda. Where that happens, we take
        reasonable steps to make sure your information is protected to a standard comparable to Ugandan law, as the
        Data Protection and Privacy Act requires.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    content: (
      <>
        <p>
          We keep your account information for as long as your account is open. When you ask us to delete your
          account, we delete or anonymise your personal information, except what we must keep:
        </p>
        <LegalList>
          <li>
            payment and booking records, which we keep for as long as needed to meet legal, tax, accounting and
            dispute-resolution requirements;
          </li>
          <li>information needed to prevent fraud or to protect against, or respond to, legal claims.</li>
        </LegalList>
        <p>
          Live driver location is not stored. Church referral information stays in your browser for 30 days and then
          expires.
        </p>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights and choices',
    content: (
      <>
        <p>Under the Data Protection and Privacy Act, 2019, you have the right to:</p>
        <LegalList>
          <li>ask what personal data we hold about you and get a copy;</li>
          <li>have inaccurate or incomplete data corrected;</li>
          <li>ask us to delete your data, subject to the exceptions in the section above;</li>
          <li>object to, or ask us to restrict, certain uses of your data;</li>
          <li>withdraw your consent at any time, without affecting what we did before you withdrew it.</li>
        </LegalList>
        <p>
          You can update most of your details yourself from your profile. For anything else, or to delete your
          account, email <SupportEmail />. We may need to confirm it is really you before acting on a request, and we
          will respond as soon as reasonably possible and within any timeframe the law sets.
        </p>
        <p>
          You can turn off location access at any time in your browser or device settings; the Service still works,
          you just choose your pickup point by searching or on the map.
        </p>
        <p>
          If you believe we have not handled your data properly, please contact us first so we can fix it. You also
          have the right to complain to Uganda's Personal Data Protection Office, which is part of the National
          Information Technology Authority (NITA-U).
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Keeping your information safe',
    content: (
      <>
        <p>
          We protect your information with measures such as encrypted connections (HTTPS), hashed passwords, and
          database access rules that limit who can read or change each record. Payment details are handled by our
          payment provider rather than by us.
        </p>
        <p>
          No system is completely secure. Please choose a strong, unique password and keep it private. If you think
          your account has been accessed by someone else, tell us straight away at <SupportEmail />. If a security
          incident affects your personal data, we will notify you and the authorities as the law requires.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: "Children's privacy",
    content: (
      <p>
        The Service is for people aged {LEGAL.minimumAge} and over. We do not knowingly collect information from
        anyone younger. If you believe a child has given us personal information, contact us and we will delete it.
      </p>
    ),
  },
  {
    id: 'storage',
    title: 'Cookies and browser storage',
    content: (
      <>
        <p>
          We do not use advertising or cross-site tracking cookies. We use your browser's storage only for things the
          Service needs to work: keeping you signed in, remembering your light/dark theme choice, and remembering a
          church referral for 30 days.
        </p>
        <p>You can clear this data in your browser settings; you will simply be signed out and lose those preferences.</p>
      </>
    ),
  },
  {
    id: 'google-data',
    title: 'Information from Google',
    content: (
      <p>
        If you sign in with Google, we use your name, email address and profile picture only to create and secure your
        account and show your profile in the Service. We do not use it for advertising, and we do not share it except
        with the providers listed above that help us run the Service. Our use of information received from Google
        follows the{' '}
        <LegalLink href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </LegalLink>
        .
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    content: (
      <p>
        We may update this policy as the Service changes or the law does. When we make a significant change, we will
        update the date at the top and, where appropriate, let you know in the Service or by email. Continuing to use
        the Service after a change means you accept the updated policy.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    content: (
      <p>
        Questions, requests or concerns about your privacy? Email <SupportEmail /> or write to {LEGAL.serviceName},{' '}
        {LEGAL.location}.
      </p>
    ),
  },
]

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      path="/privacy"
      seoDescription="How Blue OX Rides collects, uses and protects your personal information, including your location, and the rights you have over it."
      summary={
        <>
          <p>
            We collect only what we need to run a carpooling service: your account details, the rides you post or book,
            payment references and — with your permission — your location. We never sell your data or use it for ads.
          </p>
          <p>
            Other users see your name, photo and ratings, and confirmed trip partners can see each other's phone
            number. Live driver location is shared only while a driver has it switched on, and is not stored. You can
            ask to see, correct or delete your data at any time.
          </p>
        </>
      }
      sections={sections}
      related={{ to: '/terms', label: 'Read our Terms of Use' }}
    />
  )
}
