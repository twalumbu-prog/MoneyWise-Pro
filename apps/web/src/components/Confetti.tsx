import React, { useEffect, useRef } from 'react';

/**
 * Dependency-free canvas confetti, in the MoneyWise palette (blue, white, grey,
 * black). Two phases run together: a burst that pops outward from `origin`, and
 * a slower rain that falls from the top of the screen for `rainMs`.
 *
 * Rendered as a fixed, pointer-events-none overlay so it never intercepts taps,
 * and it self-stops once every particle has left the viewport — no timers left
 * running behind a celebration the user has already scrolled past.
 *
 * Respects prefers-reduced-motion by rendering nothing at all.
 */

const COLORS = ['#006AFF', '#FFFFFF', '#9AA0A7', '#16181D'];

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    h: number;
    rotation: number;
    rotationSpeed: number;
    color: string;
    /** Horizontal wobble, so pieces flutter instead of dropping like stones. */
    swayPhase: number;
    swayAmount: number;
}

interface ConfettiProps {
    /** Where the burst originates, in viewport coordinates. Defaults to top-centre. */
    origin?: { x: number; y: number };
    /** How long new rain keeps spawning, in ms. */
    rainMs?: number;
    burstCount?: number;
    onComplete?: () => void;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

export const Confetti: React.FC<ConfettiProps> = ({
    origin,
    rainMs = 2600,
    burstCount = 90,
    onComplete,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Kept in a ref so a re-render mid-celebration can't restart the animation.
    const doneRef = useRef(false);

    useEffect(() => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            onComplete?.();
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const resize = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);

        const width = () => window.innerWidth;
        const height = () => window.innerHeight;

        const makePiece = (x: number, y: number, vx: number, vy: number): Particle => ({
            x, y, vx, vy,
            w: random(6, 11),
            h: random(9, 15),
            rotation: random(0, Math.PI * 2),
            rotationSpeed: random(-0.22, 0.22),
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            swayPhase: random(0, Math.PI * 2),
            swayAmount: random(0.25, 1.1),
        });

        const burstOrigin = origin || { x: width() / 2, y: height() * 0.28 };
        const particles: Particle[] = [];

        // Phase 1 — the pop. Radial spread, biased upward so pieces arc.
        for (let i = 0; i < burstCount; i++) {
            const angle = random(-Math.PI, 0) + random(-0.4, 0.4);
            const speed = random(5, 14);
            particles.push(makePiece(
                burstOrigin.x + random(-14, 14),
                burstOrigin.y + random(-10, 10),
                Math.cos(angle) * speed,
                Math.sin(angle) * speed
            ));
        }

        const GRAVITY = 0.22;
        const DRAG = 0.988;
        const startedAt = performance.now();
        let lastRainAt = 0;
        let frame = 0;

        const tick = (now: number) => {
            const elapsed = now - startedAt;

            // Phase 2 — the rain, drip-fed so it falls continuously rather than
            // arriving as one wall of paper.
            if (elapsed < rainMs && now - lastRainAt > 55) {
                lastRainAt = now;
                for (let i = 0; i < 4; i++) {
                    particles.push(makePiece(
                        random(0, width()),
                        random(-40, -10),
                        random(-0.8, 0.8),
                        random(1.5, 3.5)
                    ));
                }
            }

            ctx.clearRect(0, 0, width(), height());

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];

                p.vy += GRAVITY;
                p.vx *= DRAG;
                p.vy *= DRAG;
                p.swayPhase += 0.06;
                p.x += p.vx + Math.sin(p.swayPhase) * p.swayAmount;
                p.y += p.vy;
                p.rotation += p.rotationSpeed;

                if (p.y > height() + 40) {
                    particles.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                // A hairline outline keeps white pieces visible on white cards.
                if (p.color === '#FFFFFF') {
                    ctx.strokeStyle = 'rgba(22,24,29,0.18)';
                    ctx.lineWidth = 0.6;
                    ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
                }
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }

            if (particles.length === 0 && elapsed > rainMs) {
                if (!doneRef.current) {
                    doneRef.current = true;
                    onComplete?.();
                }
                return;
            }
            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="fixed inset-0 z-[9998] pointer-events-none"
        />
    );
};

export default Confetti;
