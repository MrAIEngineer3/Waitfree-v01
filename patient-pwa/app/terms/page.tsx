"use client";
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/25">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Terms & Conditions
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Effective Date: October 2025
        </p>
      </div>

      {/* Content */}
      <Card className="border-gray-200/50 bg-white/80 backdrop-blur-sm shadow-sm">
        <CardContent className="p-8 sm:p-12 space-y-8">
          {/* Section 1 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              1. Service Usage
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Waitfree is a health management platform that provides patients and clinics with queue management, 
              token tracking, and digital record storage services. By using our services, you agree to comply with 
              these terms and conditions.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              2. User Responsibility
            </h2>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span>Users are responsible for maintaining accurate and updated personal information.</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span>Unauthorized access or misuse of the platform is strictly prohibited.</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span>Users must not attempt to breach security measures or access unauthorized data.</span>
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              3. Subscription & Payment
            </h2>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span>All payments are non-refundable after service activation.</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span>Services will auto-renew unless cancelled manually by the user.</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span>Subscription prices are subject to change with prior notice to users.</span>
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              4. Data Privacy
            </h2>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Waitfree does not sell user data to third parties.</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>All health data is encrypted and stored securely using industry-standard practices.</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Your data is protected with HIPAA-grade encryption and OTP-based access.</span>
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              5. Limitation of Liability
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Waitfree is a digital facilitation platform and does not provide medical advice, diagnosis, or treatment. 
              The platform is designed to streamline healthcare access and record management. Users should consult 
              qualified healthcare professionals for medical decisions. Waitfree is not liable for any medical outcomes 
              or decisions made based on information accessed through the platform.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              6. Service Availability
            </h2>
            <p className="text-gray-600 leading-relaxed">
              While we strive to maintain continuous service availability, Waitfree reserves the right to modify, 
              suspend, or discontinue any aspect of the service at any time. We are not liable for any interruption 
              of service due to maintenance, technical issues, or circumstances beyond our control.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              7. Account Termination
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Waitfree reserves the right to suspend or terminate any user account in case of policy violations, 
              misuse of services, or unauthorized activities. Users may also request account deletion at any time 
              by contacting our support team.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              8. Modifications to Terms
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Waitfree may update these Terms & Conditions from time to time. Users will be notified of significant 
              changes via email or WhatsApp. Continued use of the service after modifications constitutes acceptance 
              of the updated terms.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              9. Governing Law
            </h2>
            <p className="text-gray-600 leading-relaxed">
              These terms are governed by the laws of India. Any disputes arising from the use of Waitfree services 
              will be subject to the exclusive jurisdiction of courts in Madhya Pradesh, India.
            </p>
          </section>

          {/* Contact Section */}
          <section className="pt-6 border-t border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              Contact Information
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              If you have any questions about these Terms & Conditions, please contact us:
            </p>
            <div className="space-y-2 text-gray-600">
              <p><strong>Waitfree Health Technologies Pvt. Ltd.</strong></p>
              <p>Maheshwar, Madhya Pradesh, India</p>
              <p>Email: <a href="mailto:docsetu.services@gmail.com" className="text-blue-600 hover:text-blue-700">docsetu.services@gmail.com</a></p>
              <p>Phone/WhatsApp: <a href="tel:+918817244374" className="text-blue-600 hover:text-blue-700">+91-8817244374</a></p>
            </div>
          </section>
        </CardContent>
      </Card>

      {/* Back to Home */}
      <div className="mt-8 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
