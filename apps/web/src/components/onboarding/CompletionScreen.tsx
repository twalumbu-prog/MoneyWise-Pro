import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PrimaryButton } from './ui';

/** Lightweight canvas confetti — no dependency, respects reduced motion. */
const ConfettiCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        let raf = 0;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const COLORS = ['#006AFF', '#03D47C', '#FF2970', '#FFC531', '#002E3B'];
        const pieces = Array.from({ length: 160 }, () => ({
            x: Math.random() * canvas.width,
            y: -20 - Math.random() * canvas.height * 0.5,
            w: 6 + Math.random() * 6,
            h: 8 + Math.random() * 8,
            vy: 2 + Math.random() * 3,
            vx: -1.5 + Math.random() * 3,
            rot: Math.random() * Math.PI,
            vr: -0.1 + Math.random() * 0.2,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
        }));

        const started = Date.now();
        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const elapsed = Date.now() - started;
            let alive = false;
            for (const p of pieces) {
                p.y += p.vy;
                p.x += p.vx + Math.sin(p.y / 40);
                p.rot += p.vr;
                if (p.y < canvas.height + 20) alive = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = elapsed > 4500 ? Math.max(0, 1 - (elapsed - 4500) / 1000) : 1;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }
            if (alive && elapsed < 5500) raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-10" aria-hidden />;
};

/** Final screen — celebration + entry into the app. */
export const CompletionScreen: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="mw-font-figtree min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <ConfettiCanvas />

            <div className="relative z-20 text-center max-w-md">
                {/* Animated checkmark */}
                <div
                    className="mx-auto w-24 h-24 rounded-full bg-[#03D47C] flex items-center justify-center shadow-xl shadow-[#03D47C]/30 mw-anim"
                    style={{ animation: 'mw-scale-in 0.6s cubic-bezier(0.34,1.56,0.64,1) both' }}
                >
                    <svg viewBox="0 0 24 24" className="w-12 h-12 text-white" fill="none" stroke="currentColor"
                        strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path
                            d="M4.5 12.5l5 5L19.5 7"
                            strokeDasharray={48}
                            style={{ animation: 'mw-check-draw 0.6s ease-out 0.35s both' }}
                        />
                    </svg>
                </div>

                <h1
                    className="mt-8 text-3xl sm:text-4xl font-bold text-gray-800 tracking-tight mw-anim"
                    style={{ animation: 'mw-fade-up 0.5s ease-out 0.3s both' }}
                >
                    Welcome to MoneyWise!
                </h1>
                <p
                    className="mw-font-dmsans mt-3 text-gray-600 mw-anim"
                    style={{ animation: 'mw-fade-up 0.5s ease-out 0.45s both' }}
                >
                    Your business is now ready to receive payments and manage finances.
                </p>

                <div
                    className="mt-10 mw-anim"
                    style={{ animation: 'mw-fade-up 0.5s ease-out 0.6s both' }}
                >
                    <PrimaryButton onClick={() => navigate('/', { replace: true })} className="w-full sm:w-auto">
                        Go to Dashboard
                        <ArrowRight className="h-4 w-4" />
                    </PrimaryButton>
                </div>
            </div>
        </div>
    );
};
