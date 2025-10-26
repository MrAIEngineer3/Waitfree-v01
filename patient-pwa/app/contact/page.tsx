"use client";
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export default function ContactPage() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const contactMethods = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      title: 'Email',
      value: 'docsetu.services@gmail.com',
      description: 'Send us an email anytime',
      link: 'mailto:docsetu.services@gmail.com'
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
      title: 'Phone',
      value: '+91-8817244374',
      description: 'Call us during office hours',
      link: 'tel:+918817244374'
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      ),
      title: 'WhatsApp',
      value: '+91-8817244374',
      description: 'Quick support via WhatsApp',
      link: 'https://wa.me/918817244374'
    }
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header - Premium gradient with blur effects */}
      <div className="mb-16 text-center relative">
        <div className="absolute inset-0 flex items-center justify-center opacity-20 blur-3xl">
          <div className="w-96 h-96 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-600 rounded-full"></div>
        </div>
        <div className="relative">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6 rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-2xl shadow-blue-500/30 transform hover:scale-105 transition-transform duration-300">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-blue-900 to-gray-900">
            Get in Touch
          </h1>
          <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            We&apos;re here to help and answer any questions you might have
          </p>
        </div>
      </div>

      {/* Contact Methods - Premium card grid with hover effects */}
      <div className="grid gap-6 md:grid-cols-3 mb-16">
        {contactMethods.map((method, index) => (
          <Card 
            key={index}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            className="group border-gray-200/50 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-2xl hover:border-blue-200 transition-all duration-300 overflow-hidden relative"
          >
            <div className={`absolute inset-0 bg-gradient-to-br from-blue-50 to-cyan-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
            <CardContent className="p-8 text-center relative z-10">
              <div className={`inline-flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-lg transform transition-all duration-300 ${hoveredIndex === index ? 'scale-110 shadow-2xl shadow-blue-500/50' : 'shadow-blue-500/25'}`}>
                {method.icon}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {method.title}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {method.description}
              </p>
              <a
                href={method.link}
                className="inline-block text-blue-600 hover:text-blue-700 font-medium break-all transition-colors duration-200"
              >
                {method.value}
              </a>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Company Info - Enhanced cards */}
      <div className="grid gap-6 md:grid-cols-2 mb-12">
        {/* Office Info */}
        <Card className="group border-gray-200/50 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:border-blue-200 transition-all duration-300">
          <CardContent className="p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/25 transform group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Our Office
                </h3>
                <div className="space-y-2 text-gray-600">
                  <p className="font-medium text-gray-900">
                    Waitfree Health Technologies Pvt. Ltd.
                  </p>
                  <p>Maheshwar, Madhya Pradesh, India</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Office Hours */}
        <Card className="group border-gray-200/50 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-xl hover:border-emerald-200 transition-all duration-300">
          <CardContent className="p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/25 transform group-hover:scale-110 transition-transform duration-300">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Office Hours
                </h3>
                <div className="space-y-2 text-gray-600">
                  <div className="flex justify-between gap-4">
                    <span className="font-medium">Monday - Saturday</span>
                    <span>10:00 AM - 7:00 PM</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="font-medium">Sunday</span>
                    <span className="text-gray-500">Closed</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Info - Enhanced CTA */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50/50 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <CardContent className="p-10 text-center relative z-10">
          <h3 className="text-2xl font-semibold text-gray-900 mb-3">
            Need Immediate Assistance?
          </h3>
          <p className="text-gray-600 mb-8 max-w-lg mx-auto">
            Our support team typically responds within a few hours during office hours
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="https://wa.me/918817244374"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium rounded-full hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg hover:shadow-2xl hover:scale-105 duration-300"
            >
              <svg className="w-5 h-5 transform group-hover:scale-110 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              Chat on WhatsApp
            </a>
            <a
              href="mailto:docsetu.services@gmail.com"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-white border-2 border-blue-600 text-blue-600 font-medium rounded-full hover:bg-blue-50 transition-all shadow-lg hover:shadow-2xl hover:scale-105 duration-300"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Email
                </a>
              </div>
            </CardContent>
          </Card>
    </div>
  );
}
