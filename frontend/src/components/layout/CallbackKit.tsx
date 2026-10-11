import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useSessionStore } from "@/stores/sessionStore";
import { useLabStore } from "@/stores/labStore";
import { callbackSnippets } from "@/lib/lab";
import { getBaseDomain, getDnsDomain } from "@/lib/config";
import { copyToClipboard } from "@/lib/utils";

export function SnippetTable() {
  const subdomain = useSessionStore((s) => s.activeSubdomain);
  const scheme = useLabStore((s) => s.scheme);
  const snippets = callbackSnippets(
    `${subdomain ?? "SESSION"}.${getBaseDomain()}`,
    `${subdomain ?? "SESSION"}.${getDnsDomain()}`,
    scheme,
  );
  return (
    <table className="snippet-table">
      <tbody>
        {snippets.map((snippet) => (
          <tr key={snippet.label}>
            <td>
              {snippet.label}
              <span>{snippet.detail}</span>
            </td>
            <td>
              <code>{snippet.code}</code>
            </td>
            <td>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Copy ${snippet.label}`}
                disabled={!subdomain}
                onClick={async () => {
                  await copyToClipboard(snippet.code);
                  toast.success(`Copied ${snippet.label.toLowerCase()}`);
                }}
              >
                <Copy size={14} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
