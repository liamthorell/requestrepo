import { Link } from "react-router-dom";
import { toast } from "sonner";
import { SnippetTable } from "./CallbackKit";
import { useSessionStore } from "@/stores/sessionStore";
import { useLabStore } from "@/stores/labStore";
import { getBaseDomain } from "@/lib/config";
import { copyToClipboard } from "@/lib/utils";

export function LabFooter() {
  return (
    <p className="landing-foot">
      KebabEngineers’ fork of{" "}
      <a
        href="https://github.com/adrgs/requestrepo"
        target="_blank"
        rel="noreferrer"
      >
        requestrepo
      </a>
      . Captures live in memory and are gone after a restart; export what you
      need.
    </p>
  );
}

export function LabWelcome() {
  const subdomain = useSessionStore((s) => s.activeSubdomain);
  const scheme = useLabStore((s) => s.scheme);
  const host = `${subdomain ?? "…"}.${getBaseDomain()}`;

  return (
    <div className="landing">
      <h1>This session is listening on</h1>
      <div className="landing-url">
        <code>
          <span>{scheme}://</span>
          {host}
        </code>
        <button
          type="button"
          disabled={!subdomain}
          onClick={() => {
            copyToClipboard(`${scheme}://${host}`);
            toast.success("URL copied");
          }}
        >
          Copy
        </button>
      </div>
      <p className="landing-lede">
        HTTP and HTTPS on any path, DNS lookups for any name under it, and mail
        to any address @{host}. Hits show up on the left as they land; pick one
        to read the whole thing.
      </p>

      <h2>Snippets</h2>
      <SnippetTable />

      <div className="landing-next">
        <Link to="/response">
          Edit the response <span>— body, status, headers</span>
        </Link>
        <Link to="/dns">
          DNS records <span>— A, AAAA, CNAME, TXT</span>
        </Link>
      </div>
    </div>
  );
}
