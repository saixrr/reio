import { useEffect, useRef, useCallback } from 'react';

/**
 * usePose — MediaPipe Pose with optional Person-Lock
 *
 * Person-lock algorithm:
 *   At lock time, we capture the centroid and bounding-box size of the
 *   current pose.  Every subsequent frame we compare incoming landmark
 *   centroids to the locked target.  Only if the centroid is within the
 *   LOCK_RADIUS (normalized fraction of frame) do we process the frame.
 *   This prevents the skeleton jumping to a different person who walks
 *   into frame, while still allowing the tracked user to move.
 *
 * @param {React.RefObject} videoRef  - ref to <video> element
 * @param {React.RefObject} canvasRef - ref to <canvas> overlay element
 * @param {Function} onResults        - callback(results, isPersonLost) per frame
 * @param {boolean}  active           - whether pose detection should run
 * @param {boolean}  personLocked     - whether person-lock is engaged
 * @param {Function} onLockData       - callback({ cx, cy, size }) to store lock target
 * @param {{ cx, cy, size }|null} lockTarget - locked person descriptor
 */
export function usePose(videoRef, canvasRef, onResults, active, personLocked, onLockData, lockTarget) {
    const poseRef = useRef(null);
    const cameraRef = useRef(null);

    // ── Drawing ──────────────────────────────────────────────────
    const drawResults = useCallback(
        (results, isLost, locked) => {
            const canvas = canvasRef.current;
            const video = videoRef.current;
            if (!canvas || !video) return;

            const ctx = canvas.getContext('2d');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (!results.poseLandmarks) return;

            // Choose skeleton colour based on lock state
            const skeletonColor = locked
                ? (isLost ? '#f59e0b' : '#00f5d4')   // cyan = locked & tracked, amber = lost
                : '#00f5ff';                            // default blue

            // Draw connections
            const CONNECTIONS = window.POSE_CONNECTIONS || [];
            ctx.strokeStyle = skeletonColor;
            ctx.lineWidth = 2.5;
            CONNECTIONS.forEach(([si, ei]) => {
                const s = results.poseLandmarks[si];
                const e = results.poseLandmarks[ei];
                if (!s || !e) return;
                ctx.beginPath();
                ctx.moveTo(s.x * canvas.width, s.y * canvas.height);
                ctx.lineTo(e.x * canvas.width, e.y * canvas.height);
                ctx.stroke();
            });

            // Draw landmark dots
            results.poseLandmarks.forEach((lm) => {
                ctx.beginPath();
                ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI);
                ctx.fillStyle = locked ? '#00f5d4' : '#ff4d6d';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.stroke();
            });

            // If locked, draw a corner-bracket around the detected person
            if (locked && !isLost) {
                const xs = results.poseLandmarks.map(l => l.x * canvas.width);
                const ys = results.poseLandmarks.map(l => l.y * canvas.height);
                const x1 = Math.min(...xs) - 10;
                const y1 = Math.min(...ys) - 10;
                const x2 = Math.max(...xs) + 10;
                const y2 = Math.max(...ys) + 10;
                const blen = 20;
                ctx.strokeStyle = '#00f5d4';
                ctx.lineWidth = 3;
                [[x1, y1, x1 + blen, y1, x1, y1 + blen], [x2, y1, x2 - blen, y1, x2, y1 + blen],
                [x1, y2, x1 + blen, y2, x1, y2 - blen], [x2, y2, x2 - blen, y2, x2, y2 - blen]].forEach(([ax, ay, bx, by, cx, cy]) => {
                    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); ctx.stroke();
                });
            }
        },
        [videoRef, canvasRef]
    );

    // ── Centroid helpers ─────────────────────────────────────────
    const getLandmarkDescriptor = (landmarks) => {
        const xs = landmarks.map(l => l.x);
        const ys = landmarks.map(l => l.y);
        const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
        const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
        const size = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        return { cx, cy, size };
    };

    const LOCK_RADIUS = 0.35; // normalized — must be within 35% of frame width/height

    // ── Main effect ──────────────────────────────────────────────
    useEffect(() => {
        if (!active) {
            if (cameraRef.current) { cameraRef.current.stop(); cameraRef.current = null; }
            return;
        }

        const initPose = () => {
            if (!window.Pose || !window.Camera) { setTimeout(initPose, 200); return; }

            const pose = new window.Pose({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
            });
            pose.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                smoothSegmentation: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });
            pose.onResults((results) => {
                if (!results.poseLandmarks) {
                    // Pass no-person signal
                    drawResults(results, true, personLocked);
                    onResults(results, true);
                    return;
                }

                // ── Person-lock filtering ─────────────────────────
                if (personLocked && lockTarget) {
                    const { cx, cy } = getLandmarkDescriptor(results.poseLandmarks);
                    const dist = Math.sqrt(
                        Math.pow(cx - lockTarget.cx, 2) +
                        Math.pow(cy - lockTarget.cy, 2)
                    );
                    const isMatch = dist < LOCK_RADIUS;
                    drawResults(results, !isMatch, true);
                    if (isMatch) {
                        onResults(results, false);
                    } else {
                        // Person may be lost or another person is in frame
                        onResults({ poseLandmarks: null }, true);
                    }
                    return;
                }

                // Normal (unlocked) mode
                // Store descriptor so WorkoutPage can call onLockData on demand
                const desc = getLandmarkDescriptor(results.poseLandmarks);
                if (onLockData) onLockData(desc);

                drawResults(results, false, false);
                onResults(results, false);
            });

            poseRef.current = pose;

            const camera = new window.Camera(videoRef.current, {
                onFrame: async () => {
                    if (poseRef.current && videoRef.current)
                        await poseRef.current.send({ image: videoRef.current });
                },
                width: 640,
                height: 480,
            });
            camera.start();
            cameraRef.current = camera;
        };

        initPose();

        return () => {
            if (cameraRef.current) { cameraRef.current.stop(); cameraRef.current = null; }
            if (poseRef.current) { poseRef.current.close(); poseRef.current = null; }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);
}
