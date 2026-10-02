"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type QrScanner from "qr-scanner";
import { scanTicketAction } from "@app/actions/check-in";
import { scannedTicketReference } from "@/lib/scanned-ticket";
import styles from "@app/admin/admin.module.css";

export function QrCheckInScanner({ eventId }: { eventId: string }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [message, setMessage] = useState("Camera is off. Start scanning to record a participant’s onsite scan.");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let decoded = false;
    let scanner: QrScanner | undefined;
    let guidanceTimer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      try {
        const { default: Scanner } = await import("qr-scanner");
        if (cancelled || !video.current) return;
        scanner = new Scanner(video.current, (result) => {
          if (cancelled || decoded) return;
          clearTimeout(guidanceTimer);
          const ticket = scannedTicketReference(result.data, eventId, window.location.origin);
          if (!ticket) {
            setMessage("QR detected. Scan a participant ticket for this event.");
            setError("This QR code is not a ticket for this event. Scan the participant’s ticket for this event.");
            return;
          }
          decoded = true;
          clearTimeout(guidanceTimer);
          setChecking(true);
          scanner?.stop();
          setBusy(true);
          setError(null);
          setMessage("Checking ticket…");
          void scanTicketAction(eventId, ticket).then((review) => {
            if (cancelled) return;
            if ("href" in review) {
              router.push(review.href);
            } else {
              setError(review.error ?? "Could not check the ticket. Please try again.");
            }
            setActive(false);
            setBusy(false);
            setChecking(false);
            setMessage("Camera is off. Start scanning for another participant.");
          }).catch(() => {
            if (cancelled) return;
            setError("Could not check the ticket. Check your connection and try scanning again.");
            setActive(false);
            setBusy(false);
            setChecking(false);
          });
        }, {
          preferredCamera: facingMode,
          returnDetailedScanResult: true,
          maxScansPerSecond: 10,
          // Scan everything the camera sees, preserving aspect ratio and enough detail for dense tickets.
          calculateScanRegion: (camera) => {
            const width = camera.videoWidth || 640;
            const height = camera.videoHeight || 480;
            const scale = Math.min(1, 960 / Math.max(width, height));
            return { x: 0, y: 0, width, height, downScaledWidth: Math.round(width * scale), downScaledHeight: Math.round(height * scale) };
          },
          onDecodeError: (failure) => {
            if (cancelled || decoded || failure === Scanner.NO_QR_CODE_FOUND) return;
            setError("The QR reader could not process the camera image. Stop and restart scanning, or use another browser.");
          },
        });
        await scanner.start();
        // A permission prompt may finish after the scanner was closed or unmounted.
        if (cancelled) { scanner.destroy(); return; }
        if (!decoded) {
          setBusy(false);
          setMessage("Camera ready. Keep the entire QR code visible and hold it steady.");
          guidanceTimer = setTimeout(() => {
            if (!cancelled && !decoded) setMessage("No QR read yet. Move the code closer, reduce screen glare, and make sure all four corners are visible. Try switching cameras if the preview is blurry.");
          }, 8000);
        }
      } catch (failure) {
        if (cancelled) return;
        scanner?.destroy();
        const name = failure instanceof Error ? failure.name : "";
        setError(name === "NotFoundError" ? "No camera was found. Connect a camera or open this page on a phone with a camera."
          : name === "NotReadableError" ? "The camera is busy. Close other apps or browser tabs using it, then try again."
          : "Camera unavailable. Allow camera access in your browser and use HTTPS or localhost, then try again. You can also record arrival from the participant list.");
        setActive(false);
        setBusy(false);
      }
    }
    void start();
    return () => { cancelled = true; clearTimeout(guidanceTimer); scanner?.destroy(); };
  }, [active, eventId, router, facingMode]);

  return (
    <section className={styles.scannerPanel} aria-labelledby="qr-scanner-title">
      <div>
        <p className={`eyebrow ${styles.eyebrow}`}>Participant check-in</p>
        <h2 id="qr-scanner-title">Scan QR ticket</h2>
        <p className={styles.mutedText}>An arrival scan confirms attendance. Scan again after the event ends to verify onsite presence and issue their certificate.</p>
      </div>
      <div className={styles.scannerViewport} hidden={!active}>
        <video ref={video} className={styles.scannerVideo} muted playsInline aria-label="QR scanner camera preview" />
        <div className={styles.scannerGuide} aria-hidden="true" />
        <span className={styles.scannerCameraLabel}>Camera preview</span>
      </div>
      <p className={styles.mutedText} role="status">{message}</p>
      {error ? <p className={styles.message} role="alert">{error}</p> : null}
      <div className={styles.formActions}>
        <button type="button" className={active ? styles.secondaryButton : styles.button} disabled={checking} onClick={() => {
          setError(null);
          if (active) {
            setActive(false);
            setBusy(false);
            setMessage("Camera is off. Start scanning for another participant.");
          } else {
            setBusy(true);
            setChecking(false);
            setMessage("Opening camera…");
            setActive(true);
          }
        }}>{checking ? "Checking ticket…" : active ? "Stop scanning" : "Scan QR code"}</button>
        {active ? <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => {
          setBusy(true);
          setError(null);
          setMessage("Switching camera…");
          setFacingMode((current) => current === "environment" ? "user" : "environment");
        }}>Switch camera</button> : null}
      </div>
    </section>
  );
}
