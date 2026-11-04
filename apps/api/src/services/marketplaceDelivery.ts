/**
 * Delivery for Marketplace orders. It only works inside Lusaka for now.
 *
 * Three ways to get an order:
 *   PICKUP  Collect from the seller. Free.
 *   SELLER  The seller delivers for the flat charge they set on the product ("own delivery charge").
 *   OPUS    Opus Delivery: coming soon. A quote is shown now so buyers can see what it will cost, worked out the way a courier prices a
 *           parcel (a base charge, a rate per kilometre, a size band and a speed), from the seller's area to the buyer's area.
 *
 * Distances are straight-line between area centres, stretched by a road factor, so every price here is an estimate.
 */

export interface Area { name: string; lat: number; lng: number }

/** Lusaka's neighbourhoods, with an approximate centre for each. */
export const LUSAKA_AREAS: Area[] = [
    { name: 'Lusaka CBD', lat: -15.4167, lng: 28.2833 }, { name: 'Kabulonga', lat: -15.4056, lng: 28.3267 }, { name: 'Woodlands', lat: -15.4272, lng: 28.3083 },
    { name: 'Northmead', lat: -15.3977, lng: 28.3028 }, { name: 'Rhodes Park', lat: -15.3994, lng: 28.3 }, { name: 'Olympia Park', lat: -15.3911, lng: 28.3111 },
    { name: 'Roma', lat: -15.3817, lng: 28.3078 }, { name: 'Emmasdale', lat: -15.3708, lng: 28.2681 }, { name: 'Kalingalinga', lat: -15.3978, lng: 28.3317 },
    { name: 'Chelston', lat: -15.3722, lng: 28.3519 }, { name: 'Chilenje', lat: -15.4617, lng: 28.3 }, { name: 'Kabwata', lat: -15.4433, lng: 28.3167 },
    { name: 'Libala', lat: -15.4617, lng: 28.3267 }, { name: 'Chawama', lat: -15.4767, lng: 28.2733 }, { name: 'Kanyama', lat: -15.4533, lng: 28.2433 },
    { name: 'Matero', lat: -15.3722, lng: 28.2333 }, { name: 'Garden Compound', lat: -15.4083, lng: 28.2517 }, { name: 'Kamwala', lat: -15.4383, lng: 28.2933 },
    { name: 'Longacres', lat: -15.4167, lng: 28.3 }, { name: 'Fairview', lat: -15.4217, lng: 28.2967 }, { name: 'Avondale', lat: -15.4083, lng: 28.3083 },
    { name: 'Sunningdale', lat: -15.4167, lng: 28.3517 }, { name: 'Ibex Hill', lat: -15.4533, lng: 28.3767 }, { name: 'Makeni', lat: -15.4967, lng: 28.2933 },
    { name: 'Chamba Valley', lat: -15.3817, lng: 28.4 }, { name: 'Meanwood', lat: -15.3833, lng: 28.3917 }, { name: 'Munali', lat: -15.3683, lng: 28.3217 },
    { name: 'Mtendere', lat: -15.4117, lng: 28.3567 }, { name: 'Ng’ombe', lat: -15.3817, lng: 28.3517 }, { name: 'Chainda', lat: -15.3517, lng: 28.3217 },
    { name: 'Villa Elizabetha', lat: -15.4217, lng: 28.2983 }, { name: 'Thorn Park', lat: -15.4033, lng: 28.3217 }, { name: 'Jesmondine', lat: -15.4033, lng: 28.2967 },
    { name: 'State Lodge / Ridgeway', lat: -15.4217, lng: 28.3167 }, { name: 'Lusaka Airport area', lat: -15.3308, lng: 28.4526 },
];

export const areaByName = (name: string | null | undefined): Area | null => {
    const n = String(name ?? '').trim().toLowerCase();
    return LUSAKA_AREAS.find((a) => a.name.toLowerCase() === n) ?? null;
};

/** Whether a seller's stated location is in Lusaka (their town, or their address). */
export const isLusakaLocation = (...parts: Array<string | null | undefined>): boolean => parts.some((p) => /lusaka/i.test(String(p ?? '')));

/** Best guess at which Lusaka area an address text is in, by area name. */
export function areaFromText(text: string | null | undefined): Area | null {
    const t = String(text ?? '').toLowerCase();
    return LUSAKA_AREAS.find((a) => a.name.toLowerCase() !== 'lusaka cbd' && t.includes(a.name.toLowerCase().split(' / ')[0])) ?? null;
}

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
export function distanceKm(a: Area, b: Area): number {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

export type Size = 'SMALL' | 'MEDIUM' | 'LARGE' | 'BULKY';
export type Speed = 'STANDARD' | 'EXPRESS';

/**
 * Opus Delivery runs on a diesel pickup truck, so a trip is priced like a truck trip, not a parcel. Priced the way delivery apps do it:
 *
 *   fee = (base + rate per km × road km + rate per minute × driving minutes + load + handling) × peak-hour surge × speed
 *
 * with a minimum fee. Distance and driving time come from the real road route (Mapbox Directions) when MAPBOX_TOKEN is set; otherwise the
 * straight-line distance is stretched by a road factor and divided by an average city speed. The rider's own drive to the pickup isn't
 * charged. Waiting at the door is paid to the rider: the first minutes are free, then a rate per minute up to a cap (shown to the buyer;
 * it is settled with the rider, not charged at checkout).
 *
 * The rates are working numbers to be adjusted once real trip costs are known. Change them here.
 */
export const VEHICLE = { payloadKg: 1000 };
export const RATES = {
    base: 40, perKm: 9, perMinute: 1, minimum: 80,
    roadFactor: 1.25, cityKmh: 28,
    surgeFrom: 17, surgeTo: 20, surge: 1.25, // 17:00 to 19:59 Lusaka time
    loadSurcharge: 0.6, // a full truck costs this much more than an almost empty one, on top of the trip
    waiting: { freeMinutes: 5, perMinute: 2, cap: 60 },
};
const SPEED_MULTIPLIER: Record<Speed, number> = { STANDARD: 1, EXPRESS: 1.5 };
/** How much of the truck one unit uses (bed space), and a typical weight when the seller hasn't said. */
export const SIZE_INFO: Record<Size, { share: number; defaultKg: number; label: string; example: string }> = {
    SMALL: { share: 0.04, defaultKg: 3, label: 'Small', example: 'A bag or small box' },
    MEDIUM: { share: 0.12, defaultKg: 15, label: 'Medium', example: 'A TV, microwave or carton' },
    LARGE: { share: 0.4, defaultKg: 60, label: 'Large', example: 'A fridge, sofa or wardrobe' },
    BULKY: { share: 1, defaultKg: 500, label: 'Bulky', example: 'A full load of materials' },
};
/** Extra hands to load and unload. */
const handlingFor = (kg: number) => (kg >= 400 ? 120 : kg >= 150 ? 60 : kg >= 50 ? 30 : 0);
/** Lusaka is UTC+2 all year. */
const lusakaHour = (at: number) => new Date(at + 2 * 3_600_000).getUTCHours();

export interface Route { km: number; minutes: number; source: 'ROAD' | 'ESTIMATE' }

/** The road distance and driving time between two points: Mapbox when configured, otherwise straight line × road factor at city speed. */
const routes = new Map<string, Route>();
export async function roadRoute(from: Area, to: Area): Promise<Route> {
    const key = `${from.name}>${to.name}`;
    const hit = routes.get(key);
    if (hit) return hit;
    const estimate = (): Route => {
        const km = distanceKm(from, to) * RATES.roadFactor;
        return { km: Math.round(km * 10) / 10, minutes: Math.max(1, Math.round((km / RATES.cityKmh) * 60)), source: 'ESTIMATE' };
    };
    const token = process.env.MAPBOX_TOKEN;
    let route = estimate();
    if (token) {
        try {
            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&access_token=${encodeURIComponent(token)}`;
            const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
            const j: any = r.ok ? await r.json() : null;
            const leg = j?.routes?.[0];
            if (leg?.distance > 0) route = { km: Math.round(leg.distance / 100) / 10, minutes: Math.max(1, Math.round(leg.duration / 60)), source: 'ROAD' };
        } catch { /* the estimate stands */ }
    }
    routes.set(key, route);
    return route;
}

export interface OpusQuote {
    available: boolean;
    comingSoon: boolean;
    distanceKm: number;
    driveMinutes: number;
    /** ROAD when the distance and time are from the real road route, ESTIMATE when worked out from straight-line distance. */
    routeSource: 'ROAD' | 'ESTIMATE';
    size: Size;
    speed: Speed;
    weightKg: number;
    quantity: number;
    /** What share of the truck this load fills, 0 to 1 (the larger of its bed space and its weight against the payload). */
    truckShare: number;
    /** Set when the load can't go in one trip. */
    tooBig: string | null;
    breakdown: { base: number; distance: number; time: number; loadAdjustment: number; handling: number; surge: number; speedAdjustment: number };
    fee: number;
    etaMinutes: number;
    waiting: { freeMinutes: number; perMinute: number; cap: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The Opus Delivery price for this load over this route, broken down line by line. */
export function opusQuote(route: Route, load: { size?: Size; weightKg?: number | null; quantity?: number; speed?: Speed; at?: number } = {}): OpusQuote {
    const size: Size = load.size && SIZE_INFO[load.size] ? load.size : 'MEDIUM';
    const quantity = Math.max(1, Math.floor(load.quantity ?? 1));
    const unitKg = load.weightKg && load.weightKg > 0 ? load.weightKg : SIZE_INFO[size].defaultKg;
    const weightKg = round2(unitKg * quantity);
    const speed = load.speed ?? 'STANDARD';

    const distance = round2(route.km * RATES.perKm);
    const time = round2(route.minutes * RATES.perMinute);
    const trip = RATES.base + distance + time;
    const truckShare = Math.min(1, round2(Math.max(SIZE_INFO[size].share * quantity, weightKg / VEHICLE.payloadKg)));
    const overweight = weightKg > VEHICLE.payloadKg;
    const overspace = SIZE_INFO[size].share * quantity > 1;
    const loadAdjustment = round2(trip * RATES.loadSurcharge * truckShare);
    const handling = handlingFor(weightKg);
    const subtotal = trip + loadAdjustment + handling;
    const hour = lusakaHour(load.at ?? Date.now());
    const surge = hour >= RATES.surgeFrom && hour < RATES.surgeTo ? round2(subtotal * (RATES.surge - 1)) : 0;
    const beforeSpeed = subtotal + surge;
    const speedAdjustment = round2(beforeSpeed * (SPEED_MULTIPLIER[speed] - 1));
    const total = Math.max(RATES.minimum, beforeSpeed + speedAdjustment);
    return {
        available: false, comingSoon: true, distanceKm: route.km, driveMinutes: route.minutes, routeSource: route.source, size, speed, weightKg, quantity, truckShare,
        tooBig: overweight ? `This load is ${weightKg} kg, more than one delivery trip can carry (${VEHICLE.payloadKg} kg). Order fewer, or arrange pick-up.`
            : overspace ? 'This load is too big for one trip in the truck. Order fewer, or arrange pick-up.' : null,
        breakdown: { base: RATES.base, distance, time, loadAdjustment, handling, surge, speedAdjustment },
        fee: Math.ceil(total),
        etaMinutes: Math.round((speed === 'EXPRESS' ? 45 : 120) + route.minutes),
        waiting: RATES.waiting,
    };
}

export interface DeliveryOption {
    method: 'PICKUP' | 'SELLER' | 'OPUS';
    label: string;
    available: boolean;
    comingSoon?: boolean;
    fee: number;
    note: string;
}

/**
 * The ways this order could reach the buyer, with their prices. Delivery is offered only when the seller is in Lusaka and the buyer picks
 * a Lusaka area; everything else is pick-up.
 */
export function deliveryOptions(p: {
    sellerInLusaka: boolean; sellerArea: Area | null; buyerArea: Area | null; sellerFlatCharge: number; sellerDelivers: boolean; size?: Size; weightKg?: number | null; quantity?: number; speed?: Speed; sellerPlace: string | null;
    /** True once an Opus account is set up to receive the delivery fee and the dispatch request (OPUS_ORG_USERNAME). */
    opusEnabled?: boolean;
    /** The road route from the seller's area to the buyer's (see roadRoute). */
    route?: Route | null;
}): { options: DeliveryOption[]; opus: OpusQuote | null; lusakaOnly: boolean } {
    const pickupNote = p.sellerPlace ? `Collect from the seller in ${p.sellerPlace}.` : 'Arrange the pick-up with the seller.';
    const options: DeliveryOption[] = [{ method: 'PICKUP', label: 'Pick-up', available: true, fee: 0, note: pickupNote }];

    const deliverable = p.sellerInLusaka && !!p.buyerArea;
    const why = !p.sellerInLusaka ? 'Delivery works in Lusaka only, and this seller isn’t in Lusaka.' : !p.buyerArea ? 'Choose your area in Lusaka to see delivery.' : '';

    options.push({
        method: 'SELLER', label: 'Seller delivers', available: deliverable && p.sellerDelivers, fee: p.sellerFlatCharge,
        note: !p.sellerDelivers ? 'This seller doesn’t offer delivery.' : deliverable ? 'The seller brings it to you for their flat delivery charge.' : why,
    });

    const opus = p.sellerInLusaka && p.buyerArea && p.route ? opusQuote(p.route, { size: p.size, weightKg: p.weightKg, quantity: p.quantity, speed: p.speed }) : null;
    if (p.opusEnabled) {
        const ok = !!opus && !opus.tooBig;
        options.push({
            method: 'OPUS', label: 'Opus Delivery', available: ok, comingSoon: false, fee: opus?.fee ?? 0,
            note: opus?.tooBig ? opus.tooBig
                : opus ? `Collected from the seller and brought to you: K${opus.fee} for about ${opus.distanceKm} km, around ${opus.etaMinutes} minutes. Beta: the Opus team dispatches each trip by hand.`
                : why || 'Choose your area in Lusaka to see the price.',
        });
        if (opus) opus.available = ok;
    } else {
        options.push({
            method: 'OPUS', label: 'Opus Delivery', available: false, comingSoon: true, fee: opus?.fee ?? 0,
            note: opus?.tooBig ? opus.tooBig : opus ? `Coming soon. Estimated K${opus.fee} for about ${opus.distanceKm} km.` : 'Coming soon. Delivery across Lusaka.',
        });
    }
    return { options, opus, lusakaOnly: true };
}
