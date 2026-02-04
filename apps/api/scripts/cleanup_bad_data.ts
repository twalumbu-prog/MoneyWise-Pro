
import { supabase } from '../lib/supabase';

const cleanupIds = async () => {
    // Delete the specific bad records we found
    // Or just all draft/submitted/approved ones created recently if easier, 
    // but safer to target by huge total.

    const { error } = await supabase
        .from('requisitions')
        .delete()
        .gt('estimated_total', 1000000); // Delete anything over 1 million

    if (error) {
        console.error('Error cleaning up:', error);
    } else {
        console.log('Cleaned up invalid requisitions.');
    }
};

cleanupIds();
