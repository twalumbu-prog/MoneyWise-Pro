import { Clock, CheckCircle2, Check, AlertCircle, RotateCcw } from 'lucide-react-native';
import { getStatusConfig } from 'core';

/**
 * Status glyphs, mapped from core's REQUISITION_STATUS_CONFIG so the app and the
 * web inbox can never disagree about what a status means or how it reads. The
 * icon/colour pairing mirrors apps/web/src/pages/RequisitionList.tsx.
 */
export const StatusIcon: React.FC<{ status: string; size?: number }> = ({ status, size = 15 }) => {
    const { iconType } = getStatusConfig(status);
    const props = { size, strokeWidth: 1.5 };
    switch (iconType) {
        case 'clock':        return <Clock {...props} color="#1D4ED8" />;
        case 'check-circle': return <CheckCircle2 {...props} color="#1D4ED8" />;
        case 'check':        return <Check {...props} color="#10B981" />;
        case 'alert':        return <AlertCircle {...props} color="#EF4444" />;
        case 'rotate':       return <RotateCcw {...props} color="#9CA3AF" />;
        default:             return <Clock {...props} color="#9CA3AF" />;
    }
};
