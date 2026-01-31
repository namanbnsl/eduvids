import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex items-center justify-center p-6 md:p-10">
      <SignIn />
    </div>
  );
}
