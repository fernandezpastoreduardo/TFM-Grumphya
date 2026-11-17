import { RegistrationVerificationView } from "./components/RegistrationVerificationView";
import { useRegistrationVerification } from "./use-registration-verification";

export function RegistrationVerification() {
  const verification = useRegistrationVerification();
  return (
    <RegistrationVerificationView
      status={verification.status}
      plan={verification.plan}
      resendEmail={verification.resendEmail}
      resending={verification.resending}
      resendMessage={verification.resendMessage}
      onResendEmailChange={verification.setResendEmail}
      onVerify={() => void verification.verifyEmail()}
      onResend={() => void verification.resendVerification()}
      onConfirm={() => void verification.confirmSimulatedPlan()}
    />
  );
}
