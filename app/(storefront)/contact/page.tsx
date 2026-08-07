"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { Mail, Phone, MapPin } from "lucide-react";

export default function ContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate sending an email/storing in DB
    setTimeout(() => {
      setIsSubmitting(false);
      addToast({ title: "Message Sent", description: "We will get back to you shortly.", type: "success" });
      (e.target as HTMLFormElement).reset();
    }, 1500);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 md:px-16 py-12 md:py-24 w-full">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h1 className="text-4xl md:text-5xl font-serif mb-4">Contact Us</h1>
        <p className="text-foreground-secondary text-lg">
          Have a question or need assistance? We're here to help. Reach out to our customer service team and we'll respond as soon as possible.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 max-w-5xl mx-auto">
        
        {/* Contact Form */}
        <div className="bg-background-secondary p-8 md:p-12 rounded-2xl">
          <h2 className="text-2xl font-serif mb-6">Send a Message</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Input label="First Name" required />
              <Input label="Last Name" required />
            </div>
            <Input label="Email Address" type="email" required />
            <Input label="Subject" required />
            
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-widest font-bold text-foreground-secondary">
                Message
              </label>
              <textarea 
                required
                rows={5}
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all resize-none"
                placeholder="How can we help you?"
              />
            </div>

            <Button variant="primary" type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Sending..." : "Send Message"}
            </Button>
          </form>
        </div>

        {/* Contact Info */}
        <div className="flex flex-col gap-12 justify-center">
          <div className="flex flex-col gap-8">
            
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-background-secondary rounded-full flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-serif mb-1">Email</h3>
                <p className="text-foreground-secondary mb-2">Our friendly team is here to help.</p>
                <a href="mailto:support@example.com" className="font-medium hover:text-accent transition-colors">support@example.com</a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-background-secondary rounded-full flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-serif mb-1">Office</h3>
                <p className="text-foreground-secondary mb-2">Come say hello at our headquarters.</p>
                <address className="not-italic font-medium text-foreground">
                  100 Premium Way<br />
                  Suite 400<br />
                  San Francisco, CA 94107
                </address>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-background-secondary rounded-full flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-serif mb-1">Phone</h3>
                <p className="text-foreground-secondary mb-2">Mon-Fri from 8am to 5pm.</p>
                <a href="tel:+15550000000" className="font-medium hover:text-accent transition-colors">+1 (555) 000-0000</a>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
