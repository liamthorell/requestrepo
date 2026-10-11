import { Link } from "react-router-dom";
import { ArrowUpRight, Radio, Flame } from "lucide-react";
import { KebabMark } from "./KebabMark";
import { SnippetCards } from "./CallbackKit";

export function LabWelcome() {
  return (
    <div className="lab-welcome">
      <div className="welcome-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <Flame size={13} /> KEBABENGINEERS / REQUEST LAB
          </span>
          <h1>
            The grill is hot.
            <br />
            <span>Bring the callbacks.</span>
          </h1>
          <p>
            Your workspace for HTTP, DNS and SMTP evidence. Catch the signal,
            inspect the details, and keep the good bits for your write-up.
          </p>
          <div className="hero-status">
            <Radio size={15} />
            <span>Waiting for your first selection</span>
          </div>
        </div>
        <div className="hero-emblem">
          <div className="emblem-ring">
            <KebabMark className="h-32 w-32 text-primary" />
          </div>
          <span>GOOD PAYLOADS. GREAT KEBABS.</span>
        </div>
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">01 / SEND A SIGNAL</span>
          <h2>Callback cookbook</h2>
        </div>
        <span className="text-xs text-default-500">
          Your session, already filled in
        </span>
      </div>
      <SnippetCards />
      <div className="welcome-links">
        <Link to="/response">
          <div>
            <span className="eyebrow">02 / SERVE SOMETHING</span>
            <h3>Build a custom response</h3>
            <p>Edit the body, headers and status code.</p>
          </div>
          <ArrowUpRight size={22} />
        </Link>
        <Link to="/dns">
          <div>
            <span className="eyebrow">03 / FOLLOW THE TRAIL</span>
            <h3>Configure DNS records</h3>
            <p>Set up A, AAAA, CNAME and TXT answers.</p>
          </div>
          <ArrowUpRight size={22} />
        </Link>
      </div>
      <p className="lab-footer">
        Made for KebabEngineers <span>✦</span> Powered by{" "}
        <a
          href="https://github.com/adrgs/requestrepo"
          target="_blank"
          rel="noreferrer"
        >
          RequestRepo
        </a>
      </p>
    </div>
  );
}
