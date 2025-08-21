import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div 
      className="flex justify-center py-24" 
      data-testid="sign-in-page"
      role="main"
      aria-label="Sign in page"
    >
      <div data-testid="clerk-sign-in-component">
        <SignIn />
      </div>
    </div>
  );
}
