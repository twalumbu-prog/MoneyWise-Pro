/** One-off: the China source's "Car" category (car accessories) is renamed so it isn't confused with "Cars" (vehicles). Run: npx tsx src/scripts/rename_car_category.ts */
import { supabase } from '../lib/supabase';

(async () => {
    const { data, error } = await supabase.from('imported_products').update({ category: 'Car accessories' }).eq('category', 'Car').select('id');
    console.log(error ? `failed: ${error.message}` : `renamed ${data?.length ?? 0} items`);
    process.exit(error ? 1 : 0);
})();
