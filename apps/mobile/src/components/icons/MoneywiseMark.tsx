import Svg, { Path } from 'react-native-svg';

const VIEWBOX_WIDTH = 86;
const VIEWBOX_HEIGHT = 54;
const ASPECT = VIEWBOX_WIDTH / VIEWBOX_HEIGHT;

/**
 * MoneyWise brand mark — the "M" stroke wordmark (org's official stroke
 * logo asset). Used on the wallet card, top-right, next to the wallet name.
 * `height` scales the width to match the source's aspect ratio.
 */
export const MoneywiseMark: React.FC<{ color?: string; height?: number }> = ({ color = '#FFFFFF', height = 20 }) => (
    <Svg width={Math.round(height * ASPECT)} height={height} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} fill="none">
        <Path
            d="M9.18164 44.6529L20.6263 16.6112C22.6576 11.6342 29.7053 11.6342 31.7366 16.6112L37.6261 31.0417C39.6574 36.0187 46.7051 36.0187 48.7364 31.0417L54.6259 16.6112C56.6572 11.6342 63.705 11.6342 65.7362 16.6112L77.1809 44.6529"
            stroke={color} strokeWidth={8} strokeLinecap="round"
        />
        <Path d="M83.0007 34.5659L64.0918 34.5659" stroke={color} strokeWidth={6} strokeLinecap="round" />
        <Path d="M21.5453 34.5674H3" stroke={color} strokeWidth={6} strokeLinecap="round" />
    </Svg>
);
