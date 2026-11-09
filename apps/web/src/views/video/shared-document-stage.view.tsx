"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DocumentViewers } from "@/interfaces/services/document-viewer.interface";
import type { CallChannel } from "@/interfaces/services/video-room.interface";
import {
  callShareRules,
  clampZoom,
  parseCallShareMessage,
  type CallShare,
} from "@/models/video/video-call.model";
import { BackIcon, CloseIcon, FileIcon } from "@/views/chat/chat-icons.view";

interface SharedDocumentStageProps {
  readonly channel: CallChannel;
  readonly viewerId: string;
  readonly share: CallShare | null;
  readonly viewers: DocumentViewers;
  /** Another browser says the presentation changed; reload it from the server. */
  readonly onRefresh: () => void;
  /** Resolves to an error message, or null once stopped. */
  readonly onStop: () => Promise<string | null>;
}

interface Position {
  readonly page: number;
  readonly scroll: number;
}

type FileState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: ArrayBuffer }
  | { readonly status: "error" };

/** Shows the presented document beside the video and keeps everyone on the same page. */
export function SharedDocumentStage({
  channel,
  viewerId,
  share,
  viewers,
  onRefresh,
  onStop,
}: SharedDocumentStageProps) {
  const shareRef = useRef(share);
  const announcedRef = useRef<number | null>(null);

  useEffect(() => {
    shareRef.current = share;
  }, [share]);

  // Others reload when told something changed, or when the presenter talks
  // about a presentation this browser has not loaded (a missed message).
  useEffect(() => {
    return channel.subscribe((raw) => {
      const message = parseCallShareMessage(raw);

      if (
        message?.type === "changed" ||
        (message?.type === "position" && message.shareId !== shareRef.current?.id)
      ) {
        onRefresh();
      }
    });
  }, [channel, onRefresh]);

  // Safety net: ask the server now and then, and whenever the tab comes back.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        onRefresh();
      }
    };
    const timer = window.setInterval(refreshIfVisible, callShareRules.pollMs);

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [onRefresh]);

  // A presentation this student just started: tell everyone else.
  useEffect(() => {
    if (share && share.sharerId === viewerId && announcedRef.current !== share.id) {
      announcedRef.current = share.id;
      return channel.onConnected(() => channel.send({ type: "changed" }));
    }
  }, [channel, share, viewerId]);

  if (!share) {
    return null;
  }

  return (
    <PresentedDocument
      key={share.id}
      channel={channel}
      share={share}
      presenting={share.sharerId === viewerId}
      viewers={viewers}
      onStop={async () => {
        const error = await onStop();

        if (!error) {
          channel.send({ type: "changed" });
        }

        return error;
      }}
    />
  );
}

function PresentedDocument({
  channel,
  share,
  presenting,
  viewers,
  onStop,
}: {
  readonly channel: CallChannel;
  readonly share: CallShare;
  readonly presenting: boolean;
  readonly viewers: DocumentViewers;
  readonly onStop: () => Promise<string | null>;
}) {
  const [file, setFile] = useState<FileState>({ status: "loading" });
  const [pageCount, setPageCount] = useState<number | null>(null);
  /** The presenter's position; for the presenter, their own. */
  const [position, setPosition] = useState<Position>({ page: 1, scroll: 0 });
  const [following, setFollowing] = useState(true);
  const [ownPage, setOwnPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [docxTarget, setDocxTarget] = useState<{ readonly fraction: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const positionRef = useRef(position);
  const followingRef = useRef(following);
  const scrollTimerRef = useRef<number | undefined>(undefined);
  const lastScrollSentRef = useRef(0);

  useEffect(() => {
    followingRef.current = following;
  }, [following]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(share.fileHref, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }

        const data = await response.arrayBuffer();

        if (!cancelled) {
          setFile({ status: "ready", data });
        }
      } catch (fetchError) {
        console.error("Loading presented document failed.", fetchError);

        if (!cancelled) {
          setFile({ status: "error" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [share.fileHref]);

  const sendPosition = useCallback(() => {
    channel.send({ type: "position", shareId: share.id, ...positionRef.current });
  }, [channel, share.id]);

  // The presenter answers late joiners and repeats the position regularly;
  // viewers ask once connected.
  useEffect(() => {
    if (presenting) {
      const heartbeat = window.setInterval(sendPosition, callShareRules.heartbeatMs);
      const stopJoined = channel.onParticipantJoined(() => sendPosition());
      const stopMessages = channel.subscribe((raw) => {
        if (parseCallShareMessage(raw)?.type === "sync_request") {
          sendPosition();
        }
      });

      return () => {
        window.clearInterval(heartbeat);
        stopJoined();
        stopMessages();
      };
    }

    const stopMessages = channel.subscribe((raw, from) => {
      const message = parseCallShareMessage(raw);

      if (message?.type !== "position" || message.shareId !== share.id || from !== share.sharerId) {
        return;
      }

      positionRef.current = { page: message.page, scroll: message.scroll };
      setPosition(positionRef.current);

      if (followingRef.current) {
        setDocxTarget({ fraction: message.scroll });
      }
    });
    const stopConnected = channel.onConnected(() => channel.send({ type: "sync_request" }));

    return () => {
      stopMessages();
      stopConnected();
    };
  }, [channel, presenting, sendPosition, share.id, share.sharerId]);

  useEffect(() => () => window.clearTimeout(scrollTimerRef.current), []);

  const lastPage = pageCount ?? 1;
  const shownPage = presenting || following ? position.page : ownPage;

  function goTo(page: number) {
    const next = Math.min(Math.max(1, page), lastPage);

    if (presenting) {
      positionRef.current = { ...positionRef.current, page: next };
      setPosition(positionRef.current);
      sendPosition();
      return;
    }

    setFollowing(false);
    setOwnPage(next);
  }

  function follow() {
    setFollowing(true);
    setDocxTarget({ fraction: positionRef.current.scroll });
  }

  function scrolled(fraction: number) {
    if (!presenting) {
      setFollowing(false);
      return;
    }

    positionRef.current = { ...positionRef.current, scroll: fraction };

    // Throttled, with a trailing send so viewers land where the presenter stopped.
    const wait = callShareRules.scrollThrottleMs - (Date.now() - lastScrollSentRef.current);

    window.clearTimeout(scrollTimerRef.current);

    if (wait <= 0) {
      lastScrollSentRef.current = Date.now();
      sendPosition();
    } else {
      scrollTimerRef.current = window.setTimeout(() => {
        lastScrollSentRef.current = Date.now();
        sendPosition();
      }, wait);
    }
  }

  async function stop() {
    setStopping(true);
    setError(null);

    try {
      setError(await onStop());
    } finally {
      setStopping(false);
    }
  }

  // Viewers may close a presentation whose presenter's connection dropped.
  const canStop = presenting || !channel.isConnected(share.sharerId);

  return (
    <section className="call-share" aria-label={`Presented document: ${share.title}`}>
      <header className="call-share-toolbar">
        <span className="call-share-title">
          <FileIcon />
          <span>
            <strong>{share.title}</strong>
            <small>{presenting ? "You are presenting" : `Presented by ${share.sharerName}`}</small>
          </span>
        </span>

        {share.kind === "pdf" ? (
          <span className="call-share-controls">
            <button
              className="chat-icon-button small"
              type="button"
              onClick={() => goTo(shownPage - 1)}
              disabled={shownPage <= 1}
              aria-label="Previous page"
            >
              <BackIcon />
            </button>
            <span className="call-share-page" aria-live="polite">
              {pageCount === null ? "Page …" : `${shownPage} / ${pageCount}`}
            </span>
            <button
              className="chat-icon-button small call-share-next"
              type="button"
              onClick={() => goTo(shownPage + 1)}
              disabled={pageCount === null || shownPage >= lastPage}
              aria-label="Next page"
            >
              <BackIcon />
            </button>
            <button
              className="chat-icon-button small"
              type="button"
              onClick={() => setZoom((current) => clampZoom(current - callShareRules.zoomStep))}
              disabled={zoom <= callShareRules.minZoom}
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="call-share-zoom">{Math.round(zoom * 100)}%</span>
            <button
              className="chat-icon-button small"
              type="button"
              onClick={() => setZoom((current) => clampZoom(current + callShareRules.zoomStep))}
              disabled={zoom >= callShareRules.maxZoom}
              aria-label="Zoom in"
            >
              +
            </button>
          </span>
        ) : null}

        <span className="call-share-actions">
          {!presenting && !following ? (
            <button className="button button-outline call-share-button" type="button" onClick={follow}>
              {share.kind === "pdf" ? `Follow ${share.sharerName} (p. ${position.page})` : `Follow ${share.sharerName}`}
            </button>
          ) : null}
          {canStop ? (
            <button
              className="button chat-button-danger call-share-button"
              type="button"
              onClick={() => void stop()}
              disabled={stopping}
            >
              <CloseIcon />
              {stopping ? "Stopping..." : presenting ? "Stop presenting" : "Close"}
            </button>
          ) : null}
        </span>
      </header>

      {error ? (
        <p className="chat-composer-error call-share-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="call-share-body">
        {file.status === "loading" ? <p className="call-share-message">Opening {share.fileName}…</p> : null}
        {file.status === "error" ? (
          <p className="call-share-message">
            {share.fileName} could not be shown here.{" "}
            <a href={share.fileHref} target="_blank" rel="noopener noreferrer">
              Open it in a new tab
            </a>{" "}
            instead. If that fails too, the presentation may have ended.
          </p>
        ) : null}
        {file.status === "ready" && share.kind === "pdf" ? (
          <viewers.Pdf
            data={file.data}
            page={shownPage}
            zoom={zoom}
            onLoaded={setPageCount}
            onError={() => setFile({ status: "error" })}
          />
        ) : null}
        {file.status === "ready" && share.kind === "docx" ? (
          <viewers.Docx
            data={file.data}
            scrollTo={presenting ? null : docxTarget}
            onScroll={scrolled}
            onLoaded={() => undefined}
            onError={() => setFile({ status: "error" })}
          />
        ) : null}
      </div>
    </section>
  );
}
