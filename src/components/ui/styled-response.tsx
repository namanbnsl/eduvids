import { Response } from "@/components/response";

const StyledResponse = ({ text, role }: { text: string; role: string }) => {
  return (
    <Response
      className={`
        max-w-none text-base leading-relaxed break-words ${
          role == "assistant" ? "p-4" : ""
        } rounded-lg

        /* Direct element styling */
        [&>h1]:mt-6 [&>h1]:mb-4 [&>h1]:font-bold [&>h1]:text-xl
        [&>h2]:mt-5 [&>h2]:mb-3 [&>h2]:font-bold [&>h2]:text-lg
        [&>h3]:mt-4 [&>h3]:mb-2 [&>h3]:font-semibold [&>h3]:text-base
        [&>h4]:mt-3 [&>h4]:mb-2 [&>h4]:font-medium

        [&>p]:my-3 [&>p]:leading-relaxed

        [&>ul]:my-3 [&>ul]:pl-6 [&>ul]:list-disc [&>ul]:space-y-1
        [&>ol]:my-3 [&>ol]:pl-6 [&>ol]:list-decimal [&>ol]:space-y-1
        [&_li]:leading-relaxed

        [&>pre]:my-4 [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:overflow-x-auto
        [&>pre]:bg-muted [&>pre]:text-foreground

        [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm
        [&_code]:bg-muted [&_code]:text-foreground

        [&>blockquote]:my-4 [&>blockquote]:pl-4 [&>blockquote]:border-l-4
        [&>blockquote]:border-border
        [&>blockquote]:italic [&>blockquote]:text-muted-foreground

        [&_.math-display]:my-4 [&_.math-display]:text-center
        [&_.math-inline]:mx-1
      `}
    >
      {text}
    </Response>
  );
};

export { StyledResponse };
