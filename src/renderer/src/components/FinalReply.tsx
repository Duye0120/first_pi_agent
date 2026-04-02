import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Highlight, themes } from "prism-react-renderer";
import { useCallback, useState } from "react";

type Props = {
  text: string;
  isStreaming?: boolean;
};

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded-md border border-[var(--color-border)] bg-bg-primary px-2 py-0.5 text-[11px] text-text-muted opacity-0 transition hover:text-text-primary group-hover:opacity-100"
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

export function FinalReply({ text, isStreaming }: Props) {
  if (!text && isStreaming) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-pi-accent" />
        正在回复…
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="prose prose-sm max-w-none text-[13px] leading-7 text-gray-700 prose-headings:text-gray-800 prose-code:rounded prose-code:bg-[var(--color-bg-tertiary)] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[12px] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:p-0 prose-a:text-pi-accent">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...rest }) {
            const match = /language-(\w+)/.exec(className || "");
            const code = String(children).replace(/\n$/, "");

            if (!match) {
              // Inline code
              return <code className={className} {...rest}>{children}</code>;
            }

            return (
              <div className="group relative">
                <CopyButton code={code} />
                <Highlight
                  theme={themes.github}
                  code={code}
                  language={match[1]}
                >
                  {({ className: hlClassName, style, tokens, getLineProps, getTokenProps }) => (
                    <pre
                      className={`${hlClassName} overflow-x-auto rounded-lg border border-[var(--color-code-border)] p-4 text-[12px] leading-5`}
                      style={{ ...style, background: "var(--color-code-bg)" }}
                    >
                      {tokens.map((line, i) => {
                        const { key: lineKey, ...restLineProps } = getLineProps({ line, key: i });
                        return (
                          <div key={i} {...restLineProps}>
                            {line.map((token, j) => {
                              const { key: tokenKey, ...restTokenProps } = getTokenProps({ token, key: j });
                              return <span key={j} {...restTokenProps} />;
                            })}
                          </div>
                        );
                      })}
                    </pre>
                  )}
                </Highlight>
              </div>
            );
          },
          pre({ children }) {
            // Unwrap <pre> since Highlight renders its own
            return <>{children}</>;
          },
        }}
      />
      {isStreaming && (
        <span className="inline-block h-4 w-0.5 animate-pulse bg-text-primary align-text-bottom" />
      )}
    </div>
  );
}
