import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Phone, Loader2, Check, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

interface ProfileData {
  id: string;
  phone: string | null;
  phoneVerified?: boolean;
}

export default function PhoneVerification() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [phone, setPhone] = useState("");
  const [sentPhone, setSentPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery<ProfileData>({
    queryKey: ['/api/profile'],
  });

  useEffect(() => {
    if (profile?.phone && !phone) {
      setPhone(profile.phone);
    }
  }, [profile, phone]);

  const sendVerificationMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      return apiRequest('POST', '/api/sms/send-verification', { phone: phoneNumber });
    },
    onSuccess: (_, phoneNumber) => {
      setSentPhone(phoneNumber);
      setCodeSent(true);
      toast({
        title: "Code sent",
        description: "Check your phone for the 6-digit verification code.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send verification code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async (data: { phone: string; code: string }) => {
      return apiRequest('POST', '/api/sms/verify-code', data);
    },
    onSuccess: async (response) => {
      const result = await response.json();
      if (result.verified) {
        await queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
        toast({
          title: "Phone verified!",
          description: "You can now access the app.",
        });
        setLocation("/dashboard");
      } else {
        toast({
          title: "Invalid code",
          description: "The verification code is incorrect or expired. Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to verify code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendCode = () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number with area code.",
        variant: "destructive",
      });
      return;
    }
    sendVerificationMutation.mutate(phone);
  };

  const handleVerifyCode = () => {
    if (verificationCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter the 6-digit code sent to your phone.",
        variant: "destructive",
      });
      return;
    }
    verifyCodeMutation.mutate({ phone: sentPhone, code: verificationCode });
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Phone className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Verify Your Phone Number</CardTitle>
          <CardDescription>
            To use Golf Betting, we need to verify your phone number. This helps us keep your account secure and enables notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!codeSent ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  data-testid="input-phone-number"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleSendCode}
                disabled={sendVerificationMutation.isPending || !phone.trim()}
                data-testid="button-send-code"
              >
                {sendVerificationMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send Verification Code
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="text-center text-sm text-muted-foreground mb-4">
                We sent a 6-digit code to <span className="font-medium">{sentPhone}</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-widest"
                  data-testid="input-verification-code"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleVerifyCode}
                disabled={verifyCodeMutation.isPending || verificationCode.length !== 6}
                data-testid="button-verify-code"
              >
                {verifyCodeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Verify Phone
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setCodeSent(false);
                  setVerificationCode("");
                }}
                data-testid="button-change-number"
              >
                Use a different number
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => sendVerificationMutation.mutate(sentPhone)}
                disabled={sendVerificationMutation.isPending}
                data-testid="button-resend-code"
              >
                {sendVerificationMutation.isPending ? "Sending..." : "Resend code"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
