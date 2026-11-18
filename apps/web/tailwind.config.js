/** @type {import('tailwindcss').Config} */

// The Blue Opus (Google Material 3) palette. Re-pointing Tailwind's colour ramps here recolours every existing
// bg-blue-600 / text-emerald-700 / border-gray-200 class in the app at once, so pages do not each need editing.
const googleGrey = {
    50: '#F8F9FA', 100: '#F1F3F4', 200: '#E8EAED', 300: '#DADCE0', 400: '#9AA0A6',
    500: '#80868B', 600: '#5F6368', 700: '#3C4043', 800: '#202124', 900: '#202124', 950: '#171717',
};
const googleBlue = {
    50: '#E8F0FE', 100: '#D2E3FC', 200: '#AECBFA', 300: '#8AB4F8', 400: '#669DF6',
    500: '#4285F4', 600: '#1A73E8', 700: '#1967D2', 800: '#185ABC', 900: '#174EA6', 950: '#041E49',
};
const googleGreen = {
    50: '#E6F4EA', 100: '#CEEAD6', 200: '#A8DAB5', 300: '#81C995', 400: '#5BB974',
    500: '#34A853', 600: '#1E8E3E', 700: '#137333', 800: '#0D652D', 900: '#0D652D', 950: '#0A4D22',
};
const googleRed = {
    50: '#FCE8E6', 100: '#FAD2CF', 200: '#F6AEA9', 300: '#F28B82', 400: '#F28B82',
    500: '#EA4335', 600: '#D93025', 700: '#B31412', 800: '#A50E0E', 900: '#8C0A0A', 950: '#600000',
};
const googleAmber = {
    50: '#FEF7E0', 100: '#FEEFC3', 200: '#FDE293', 300: '#FDD663', 400: '#FDD663',
    500: '#FBBC04', 600: '#E37400', 700: '#B06000', 800: '#8A4B00', 900: '#704000', 950: '#4A2A00',
};
const googleOrange = {
    50: '#FEF1E8', 100: '#FDE2CC', 200: '#FDC69C', 300: '#FCAD70', 400: '#FA903E',
    500: '#FA7B17', 600: '#E8710A', 700: '#B06000', 800: '#8A4B00', 900: '#704000',
};
const googleViolet = {
    50: '#F3E8FD', 100: '#E9D2FD', 200: '#D7AEFB', 300: '#C58AF9', 400: '#AF5CF7',
    500: '#A142F4', 600: '#9334E6', 700: '#7627BB', 800: '#5F1F96', 900: '#4B1A78',
};
const googleTeal = {
    50: '#E4F7FB', 100: '#C4EEF6', 200: '#9CE0EE', 300: '#6ED1E4', 400: '#3CC4DB',
    500: '#12B5CB', 600: '#129EAF', 700: '#0B8793', 800: '#0B6F79', 900: '#085B63',
};

export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Space Grotesk', 'sans-serif'],
            },
            colors: {
                // The old brand names now resolve to the Google palette: the one brand hue is Google blue.
                brand: {
                    green: '#0B57D0',   // was the accent green; it is the brand action colour (buttons, links, focus rings)
                    blue: '#0B57D0',
                    navy: '#0B57D0',    // fills and borders; navy *text* is now ink (#1F1F1F)
                    gray: '#F8FAFD',
                    pink: '#D93025',    // destructive / attention
                    light: '#F8FAFD',
                },
                gm: {
                    cta: '#0B57D0',
                    'cta-hover': '#0842A0',
                    deep: '#041E49',
                    select: '#D3E3FD',
                    'on-select': '#041E49',
                    sheet: '#F8FAFD',
                    bar: '#F0F4F9',
                    container: '#E9EEF6',
                    outline: '#C4C7C5',
                    ink: '#1F1F1F',
                    danger: '#B3261D',
                },
                blue: googleBlue,
                indigo: { 500: '#4285F4', 600: '#1A73E8', 700: '#1967D2', 50: '#E8F0FE', 100: '#D2E3FC' },
                sky: { 500: '#24C1E0', 600: '#129EAF', 700: '#0B8793', 50: '#E4F7FB', 100: '#C4EEF6' },
                cyan: { 500: '#12B5CB', 600: '#129EAF', 700: '#0B8793', 50: '#E4F7FB', 100: '#C4EEF6' },
                teal: googleTeal,
                green: googleGreen,
                emerald: googleGreen,
                red: googleRed,
                rose: googleRed,
                amber: googleAmber,
                yellow: googleAmber,
                orange: googleOrange,
                violet: googleViolet,
                purple: googleViolet,
                pink: { 50: '#FDE7F3', 100: '#FBCFE6', 500: '#FF63B8', 600: '#E52592', 700: '#B81C73' },
                gray: googleGrey,
                slate: googleGrey,
                zinc: googleGrey,
                neutral: googleGrey,
                stone: googleGrey,
            }
        },
    },
    plugins: [],
}
