import { createClient } from '@supabase/supabase-js';

// Substitua pelos seus dados do painel do Supabase
const supabaseUrl = 'https://pomnecjcvpqegyeklims.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvbW5lY2pjdnBxZWd5ZWtsaW1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NTMyMjMsImV4cCI6MjA4NzQyOTIyM30.d5EEXIgrm3CLET4ONTre7x5XAcqftnu8tWY8-2rVUzM';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Objeto "tradutor" para manter o código original funcionando
export const base44 = {
  // Busca dados (Ex: base44.list('Transaction'))
  list: async (entityName, options = {}) => {
    let query = supabase.from(entityName.toLowerCase() + 's').select('*');
    
    // Se houver filtros no código original, o Supabase aplica aqui
    if (options.filters) {
      // Lógica simples de filtro (pode ser expandida conforme necessidade)
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Cria dados (Ex: base44.create('Transaction', {...}))
  create: async (entityName, payload) => {
    // Adiciona automaticamente o ID do usuário logado
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from(entityName.toLowerCase() + 's')
      .insert([{ ...payload, user_id: user?.id }])
      .select();

    if (error) throw error;
    return data[0];
  },

  // Você pode adicionar update e delete conforme o app precisar
};

// Mantém a exportação para não quebrar os imports nos outros arquivos
export const base44Client = base44;