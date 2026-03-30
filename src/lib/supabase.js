import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://pomnecjcvpqegyeklims.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvbW5lY2pjdnBxZWd5ZWtsaW1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTMyMjMsImV4cCI6MjA4NzQyOTIyM30.d5EEXIgrm3CLET4ONTre7x5XAcqftnu8tWY8-2rVUzM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
