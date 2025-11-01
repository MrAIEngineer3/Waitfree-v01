"use client";
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { useState } from 'react';

export default function FAQPage() {
  const faqs = [
    {
      question: 'What is Waitfree?',
      answer: 'Waitfree is a smart health-tech platform that helps both patients and clinics manage their time and records efficiently. Patients can track their doctor visit tokens live via WhatsApp, and after consultation, they receive medical reports and prescriptions in a secure Health Vault.'
    },
    {
      question: 'What benefits does Waitfree provide to patients?',
      answer: 'Waitfree offers several key benefits for patients:',
      list: [
        'Live token tracking reduces waiting time',
        'Lifetime medical records stored securely in Digital Health Vault',
        'Easy access and sharing through WhatsApp',
        '₹49/month for unlimited access and family record management'
      ]
    },
    {
      question: 'What benefits do clinics receive?',
      answer: 'Clinics benefit from:',
      list: [
        'Reduced reception workload',
        'Automated token management system',
        'Increased patient satisfaction',
        'WhatsApp-based reminders and patient engagement'
      ]
    },
    {
      question: 'Is Waitfree data secure?',
      answer: 'Yes, our system uses HIPAA-grade encryption and OTP-based access. No third party can access your personal health data without authorization. We prioritize your privacy and employ industry-leading security measures to protect your sensitive medical information.'
    },
    {
      question: 'How do I subscribe to Waitfree?',
      answer: 'Patients can subscribe for ₹49/month or ₹499/year through the WhatsApp link. Clinics have custom monthly plans available based on the number of doctors. Contact us for more details about clinic pricing.'
    },
    {
      question: 'Where can I get help?',
      answer: 'You can reach us through the following channels:',
      list: [
        'Email: docsetu.services@gmail.com',
        'Phone/WhatsApp: +91-8817244374',
        'Office Hours: Monday to Saturday, 10:00 AM - 7:00 PM'
      ]
    }
  ];

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
      {/* Header - Enhanced */}
      <div className="mb-20 text-center">
        <div className="relative inline-block mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-3xl blur-2xl opacity-20 animate-pulse" />
          <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 shadow-2xl shadow-blue-500/30 transform transition-transform hover:scale-110 duration-300">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-transparent mb-6">
          Frequently Asked Questions
        </h1>
        <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Everything you need to know about Waitfree
        </p>
      </div>

      {/* FAQ List - Accordion Style */}
      <div className="space-y-4">
        {faqs.map((faq, index) => {
          const isExpanded = expandedIndex === index;
          return (
            <div
              key={index}
              className="group"
            >
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                className="w-full text-left cursor-pointer"
              >
                <Card className="border border-gray-200/60 bg-white/80 backdrop-blur-xl shadow-sm hover:shadow-xl hover:border-gray-300/60 transition-all duration-300 overflow-hidden">
                  <CardContent className="p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors duration-200 flex-1">
                        {faq.question}
                      </h2>
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    
                    <div 
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${
                        isExpanded ? 'max-h-96 opacity-100 mt-4' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="pt-4 border-t border-gray-100">
                        <p className="text-gray-600 leading-relaxed">
                          {faq.answer}
                        </p>
                        {faq.list && (
                          <ul className="mt-6 space-y-3">
                            {faq.list.map((item, idx) => (
                              <li 
                                key={idx} 
                                className="flex items-start gap-3 text-gray-600 transform transition-transform duration-200 hover:translate-x-1"
                                style={{ animationDelay: `${idx * 50}ms` }}
                              >
                                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mt-0.5">
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                                <span className="flex-1">{item}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </button>
            </div>
          );
        })}
      </div>

      {/* CTA Section - Enhanced */}
      <div className="mt-20">
        <Card className="relative overflow-hidden border-0 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzBoLTJWMThoLTJ2MTJoLTJ2MTJoMnYtMTJoMnYxMmgyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
          <CardContent className="relative p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xl mb-6">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-3xl font-bold text-white mb-3">
              Still have questions?
            </h3>
            <p className="text-blue-50 mb-8 text-lg max-w-md mx-auto">
              Our support team is ready to help you
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-3 px-8 py-4 bg-white text-blue-600 font-semibold rounded-full hover:bg-blue-50 transition-all shadow-xl hover:shadow-2xl hover:scale-105 transform duration-200"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Contact Support
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
