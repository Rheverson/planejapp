import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pomnecjcvpqegyeklims.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvbW5lY2pjdnBxZWd5ZWtsaW1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTMyMjMsImV4cCI6MjA4NzQyOTIyM30.d5EEXIgrm3CLET4ONTre7x5XAcqftnu8tWY8-2rVUzM';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Funções base
const list = async (entityName) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from(entityName.toLowerCase() + 's')
    .select('*')
    .eq('user_id', user?.id);
  if (error) throw error;
  return data;
};

const create = async (entityName, payload) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from(entityName.toLowerCase() + 's')
    .insert([{ ...payload, user_id: user?.id }])
    .select();
  if (error) throw error;
  return data[0];
};

const update = async (entityName, id, payload) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from(entityName.toLowerCase() + 's')
    .update(payload)
    .eq('id', id)
    .eq('user_id', user?.id)
    .select();
  if (error) throw error;
  return data[0];
};

const remove = async (entityName, id) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from(entityName.toLowerCase() + 's')
    .delete()
    .eq('id', id)
    .eq('user_id', user?.id);
  if (error) throw error;
};

// Fábrica de entidade
const createEntity = (entityName) => ({
  list:   ()        => list(entityName),
  create: (payload) => create(entityName, payload),
  update: (id, payload) => update(entityName, id, payload),
  delete: (id)      => remove(entityName, id),
});

export const base44 = {
  entities: {
    Goal:        createEntity('Goal'),
    Transaction: createEntity('Transaction'),
    Account:     createEntity('Account'),
  }
};

export const base44Client = base44;