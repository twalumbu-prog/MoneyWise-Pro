
import { supabase } from '../src/lib/supabase';

async function main() {
    console.log("Searching for requisitions...");
    const { data, error } = await supabase
        .from('requisitions')
        .select('*')
        .limit(5);

    if (error) {
        console.error("Error fetching requisitions:", error);
    } else {
        console.log("Requisitions found:", JSON.stringify(data, null, 2));
    }
}

main();
