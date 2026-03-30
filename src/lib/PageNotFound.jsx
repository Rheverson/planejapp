import React from 'react';

const PageNotFound = () => {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>404 - Página não encontrada</h1>
      <p>A página que você está procurando não existe.</p>
      <a href="/">Voltar para a Home</a>
    </div>
  );
};

export default PageNotFound;