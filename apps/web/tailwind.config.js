/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            colors: {
                brand: {
                    green: '#03D47C',
                    navy: '#002E3B',
                    gray: '#F7F9FA',
                }
            }
        },
    },
    plugins: [],
}
