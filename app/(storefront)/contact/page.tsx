"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/context/AuthContext";
import { 
  Mail, 
  Phone, 
  MapPin, 
  CheckCircle2, 
  ArrowRight, 
  LogIn, 
  LifeBuoy, 
  Send,
  Loader2 
} from "lucide-react";

export default function ContactPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdTicketNumber, setCreatedTicketNumber] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      addToast({
        title: "Sign in required",
        description: "Please sign in to contact support so we can reply directly to your account.",
        type: "error",
      });
      return;
    }

    if (!subject.trim()) {
      addToast({ title: "Please enter a subject", type: "error" });
      return;
    }

    if (!message.trim()) {
      addToast({ title: "Please enter your message", type: "error" });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        category: "General Inquiry",
        subject: subject.trim(),
        description: message.trim(),
        phoneNumber: phone.trim() || undefined,
      };

      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit message.");
      }

      setCreatedTicketNumber(data.ticketNumber || data.ticket?.ticket_number);
      setSubject("");
      setMessage("");
      setPhone("");

      addToast({
        title: "Message Submitted",
        description: `Support ticket ${data.ticketNumber || data.ticket?.ticket_number} created successfully.`,
        type: "success",
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error sending message";
      addToast({ title: "Submission Failed", description: errMsg, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 md:px-16 py-12 md:py-24 w-full">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <h1 className="text-4xl md:text-5xl font-serif mb-4">Contact Us</h1>
        <p className="text-foreground-secondary text-lg">
          Have a question or need assistance? Reach out to our dedicated support team and we will respond directly to your customer dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 max-w-5xl mx-auto">
        {/* Contact Form or Sign In Prompt */}
        <div className="bg-background-secondary p-8 md:p-12 rounded-2xl">
          {createdTicketNumber ? (
            <div className="text-center py-8 space-y-5">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-slate-900 dark:text-slate-100">
                Ticket Created Successfully
              </h2>
              <div className="p-4 rounded-xl bg-background border border-border inline-block">
                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">
                  Your Support Ticket Number
                </span>
                <span className="text-2xl font-mono font-extrabold text-accent">
                  {createdTicketNumber}
                </span>
              </div>
              <p className="text-sm text-foreground-secondary max-w-sm mx-auto">
                Our support desk has received your inquiry. You will receive an alert as soon as an agent replies.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                <Link href={`/support?ticket=${createdTicketNumber}`}>
                  <Button variant="primary" className="flex items-center gap-2">
                    <LifeBuoy className="w-4 h-4" />
                    <span>Track in Support Center</span>
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  onClick={() => setCreatedTicketNumber(null)}
                >
                  Send Another Inquiry
                </Button>
              </div>
            </div>
          ) : !user ? (
            <div className="py-6 text-center space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mx-auto">
                <LogIn className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl font-serif font-bold text-foreground mb-2">
                  Sign In to Contact Support
                </h2>
                <p className="text-sm text-foreground-secondary leading-relaxed max-w-sm mx-auto">
                  To ensure fast resolution, secure conversation history, and real-time updates on your customer dashboard, please sign in before submitting an inquiry.
                </p>
              </div>
              <div className="pt-2">
                <Link href="/login?redirect=/contact">
                  <Button variant="primary" className="flex items-center gap-2 mx-auto">
                    <span>Sign In to Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-serif">Send an Inquiry</h2>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent/10 text-accent">
                  Signed in as {user.user_metadata?.full_name || user.email}
                </span>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <Input
                  label="Subject *"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Summary of your inquiry or question"
                  required
                />

                <Input
                  label="Phone Number (Optional)"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                />

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-widest font-bold text-foreground-secondary">
                    Message *
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all resize-none"
                    placeholder="How can our support team assist you today?"
                  />
                </div>

                <Button 
                  variant="primary" 
                  type="submit" 
                  disabled={isSubmitting || !subject.trim() || !message.trim()} 
                  className="w-full flex items-center justify-center gap-2 mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Ticket...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Message (Create Ticket)</span>
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Contact Info */}
        <div className="flex flex-col gap-12 justify-center">
          <div className="flex flex-col gap-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-background-secondary rounded-full flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-serif mb-1">Email Support</h3>
                <p className="text-foreground-secondary mb-2">Our dedicated support desk is here to help.</p>
                <a href="mailto:support@vendosmith.com" className="font-medium hover:text-accent transition-colors">
                  support@vendosmith.com
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-background-secondary rounded-full flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-serif mb-1">Corporate Office</h3>
                <p className="text-foreground-secondary mb-2">VENDOSMITH E-Commerce Marketplace Hub.</p>
                <address className="not-italic font-medium text-foreground text-sm leading-relaxed">
                  Tech Commerce Towers, 5th Floor<br />
                  Outer Ring Road, Bengaluru, Karnataka 560103
                </address>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-background-secondary rounded-full flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-serif mb-1">Customer Helpline</h3>
                <p className="text-foreground-secondary mb-2">Monday to Saturday from 9am to 7pm IST.</p>
                <a href="tel:+918008363674" className="font-medium hover:text-accent transition-colors">
                  +91 (0) 800-VENDOSMITH
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
