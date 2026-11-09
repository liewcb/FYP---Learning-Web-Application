"use client";

import "@livekit/components-styles";

import {
  CarouselLayout,
  Chat,
  ConnectionStateToast,
  ControlBar,
  FocusLayout,
  FocusLayoutContainer,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  isTrackReference,
  useCreateLayoutContext,
  usePinnedTracks,
  useRoomContext,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  Track,
  VideoPresets,
  type RemoteParticipant,
  type Room,
  type RoomOptions,
} from "livekit-client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type {
  CallChannel,
  VideoCallRoomProps,
} from "@/interfaces/services/video-room.interface";
import { callShareRules } from "@/models/video/video-call.model";

/**
 * Adaptive streaming sends each viewer only the resolution their tile needs,
 * dynacast stops encoding layers nobody watches, and simulcast lets weak
 * connections fall back to a lower layer, so a five-person call stays light.
 */
const roomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
  publishDefaults: { simulcast: true },
};

/**
 * Below this width the control bar shows icons only. LiveKit decides from
 * the window width, which overflows the narrow column beside a document.
 */
const compactWidth = 640;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The room's reliable data channel, limited to the presented-document topic. */
function createCallChannel(room: Room): CallChannel {
  return {
    send(message) {
      if (room.state !== ConnectionState.Connected) {
        return;
      }

      void room.localParticipant
        .publishData(encoder.encode(JSON.stringify(message)), {
          reliable: true,
          topic: callShareRules.topic,
        })
        .catch((error: unknown) => console.error("Call data message failed.", error));
    },

    subscribe(handler) {
      const listener = (
        payload: Uint8Array,
        participant?: RemoteParticipant,
        _kind?: unknown,
        topic?: string,
        _encryption?: unknown,
        senderIdentity?: string,
      ) => {
        // A message can arrive before its sender is listed as a participant,
        // so fall back to the identity carried in the packet.
        const from = participant?.identity ?? senderIdentity;

        if (topic !== callShareRules.topic || !from) {
          return;
        }

        try {
          handler(JSON.parse(decoder.decode(payload)) as unknown, from);
        } catch {
          // Not JSON; ignore it.
        }
      };

      room.on(RoomEvent.DataReceived, listener);
      return () => {
        room.off(RoomEvent.DataReceived, listener);
      };
    },

    onParticipantJoined(handler) {
      const listener = (participant: RemoteParticipant) => handler(participant.identity);

      room.on(RoomEvent.ParticipantConnected, listener);
      return () => {
        room.off(RoomEvent.ParticipantConnected, listener);
      };
    },

    onConnected(handler) {
      if (room.state === ConnectionState.Connected) {
        handler();
      }

      room.on(RoomEvent.Connected, handler);
      return () => {
        room.off(RoomEvent.Connected, handler);
      };
    },

    isConnected(identity) {
      return (
        room.localParticipant.identity === identity ||
        [...room.remoteParticipants.values()].some((participant) => participant.identity === identity)
      );
    },
  };
}

function Stage({ render }: { readonly render: (channel: CallChannel) => ReactNode }) {
  const room = useRoomContext();
  const channel = useMemo(() => createCallChannel(room), [room]);

  return render(channel);
}

function sameTrack(a: TrackReferenceOrPlaceholder, b: TrackReferenceOrPlaceholder | undefined): boolean {
  return b !== undefined && a.participant.identity === b.participant.identity && a.source === b.source;
}

/**
 * LiveKit's VideoConference, rebuilt so the control bar and chat fit the
 * column they are in: icons only when narrow, and chat drawn over the video
 * instead of squeezing it to nothing.
 */
function CallConference() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const autoFocusedRef = useRef<string | null>(null);
  const layoutContext = useCreateLayoutContext();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );
  const focusTrack = usePinnedTracks(layoutContext)?.[0];
  const carouselTracks = tracks.filter((track) => !sameTrack(track, focusTrack));
  const screenShare = tracks
    .filter(isTrackReference)
    .find((track) => track.publication.source === Track.Source.ScreenShare && track.publication.isSubscribed);
  const screenShareSid = screenShare?.publication.trackSid ?? null;
  const pin = layoutContext.pin.dispatch;

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setCompact(entry.contentRect.width < compactWidth);
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Like VideoConference: a new screen share takes focus, and focus clears when it ends.
  useEffect(() => {
    if (screenShare && screenShareSid && autoFocusedRef.current !== screenShareSid) {
      autoFocusedRef.current = screenShareSid;
      pin?.({ msg: "set_pin", trackReference: screenShare });
    } else if (!screenShareSid && autoFocusedRef.current) {
      autoFocusedRef.current = null;
      pin?.({ msg: "clear_pin" });
    }
  }, [pin, screenShare, screenShareSid]);

  return (
    <div
      ref={frameRef}
      className={["lk-video-conference", compact ? "call-compact" : null, showChat ? "call-chat-open" : null]
        .filter(Boolean)
        .join(" ")}
    >
      <LayoutContextProvider value={layoutContext} onWidgetChange={(state) => setShowChat(state.showChat)}>
        <div className="lk-video-conference-inner">
          {!focusTrack ? (
            <div className="lk-grid-layout-wrapper">
              <GridLayout tracks={tracks}>
                <ParticipantTile />
              </GridLayout>
            </div>
          ) : (
            <div className="lk-focus-layout-wrapper">
              <FocusLayoutContainer>
                <CarouselLayout tracks={carouselTracks}>
                  <ParticipantTile />
                </CarouselLayout>
                <FocusLayout trackRef={focusTrack} />
              </FocusLayoutContainer>
            </div>
          )}
          <ControlBar controls={{ chat: true, settings: false }} variation={compact ? "minimal" : "verbose"} />
        </div>
        <Chat style={{ display: showChat ? "grid" : "none" }} />
      </LayoutContextProvider>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}

/** The call: video grid, mic, camera, screen share and chat, plus the presented document. */
export function LiveKitCallRoom({ serverUrl, token, onLeave, renderStage }: VideoCallRoomProps) {
  return (
    <LiveKitRoom
      className="call-room"
      data-lk-theme="default"
      serverUrl={serverUrl}
      token={token}
      connect
      audio
      video
      options={roomOptions}
      onDisconnected={onLeave}
    >
      <div className="call-room-layout">
        <Stage render={renderStage} />
        <div className="call-video">
          <CallConference />
        </div>
      </div>
    </LiveKitRoom>
  );
}
