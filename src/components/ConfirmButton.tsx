"use client";

/**
 * Submit button that asks before firing — for destructive form actions.
 * Works as a sibling of other submit buttons via the formAction prop.
 */
export function ConfirmButton({
  message,
  formAction,
  className,
  children,
}: {
  message: string;
  formAction: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
