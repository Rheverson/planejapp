// ============================================================
// Traz as fontes da marca para dentro do app.
//
// Elas vinham de fonts.googleapis.com (Outfit) e api.fontshare.com
// (Cabinet Grotesk). No navegador funciona. No APK a primeira pintura
// acontece na fonte do sistema e, sem rede, a marca nunca aparece —
// justamente no cenário que este app mais atende: mercado, fila, ônibus.
//
// Roda de novo quando mudar peso ou família:
//   node scripts/baixar-fontes.mjs
// ============================================================

import fs from "node:fs";
import path from "node:path";

const DESTINO = "public/fonts";

// Só o subconjunto LATINO. O app é pt-BR e `latin` (U+0000–00FF) já
// cobre ç ã õ á é í ó ú â ê ô à — `latin-ext` seria o dobro de bytes
// dentro do APK para caracteres que ninguém aqui digita.
const FAMILIAS = [
  {
    nome: "Outfit",
    slug: "outfit",
    css: "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap",
    // O Google separa por subconjunto e comenta cada bloco.
    manter: (bloco) => /\/\*\s*latin\s*\*\//.test(bloco.comentario),
  },
  {
    nome: "Cabinet Grotesk",
    slug: "cabinet-grotesk",
    css: "https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700,800,900&display=swap",
    // A família PRECISA entrar no filtro: a mesma resposta do Fontshare
    // traz Satoshi e Clash Display junto, e filtrar só por peso fazia
    // "Clash Display 700" sobrescrever o Cabinet 700 — os títulos do app
    // sairiam na fonte errada, sem erro nenhum.
    manter: (bloco) =>
      bloco.familia === "Cabinet Grotesk" && ["700", "800", "900"].includes(bloco.peso),
  },
];

// Sem User-Agent de navegador, o Google devolve TTF em vez de woff2.
const CABECALHO = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

async function baixar(url) {
  const r = await fetch(url.startsWith("//") ? `https:${url}` : url, { headers: CABECALHO });
  if (!r.ok) throw new Error(`${r.status} em ${url}`);
  return r;
}

function blocos(css) {
  // Guarda o comentário que antecede cada @font-face: é onde o Google
  // diz o subconjunto.
  const achados = [];
  const re = /(\/\*[^*]*\*\/)?\s*(@font-face\s*\{[^}]*\})/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const corpo = m[2];
    achados.push({
      comentario: m[1] || "",
      corpo,
      familia: (corpo.match(/font-family:\s*['"]([^'"]+)['"]/) || [, ""])[1],
      peso: (corpo.match(/font-weight:\s*(\d+)/) || [, "400"])[1],
      estilo: (corpo.match(/font-style:\s*(\w+)/) || [, "normal"])[1],
      // O Fontshare usa URL sem protocolo (`//cdn...`).
      url: (corpo.match(/url\(['"]?((?:https:)?\/\/[^'")]+\.woff2)['"]?\)/) || [])[1],
    });
  }
  return achados;
}

async function main() {
  fs.rmSync(DESTINO, { recursive: true, force: true });
  fs.mkdirSync(DESTINO, { recursive: true });

  const partes = [];
  let bytes = 0;
  let arquivos = 0;

  for (const familia of FAMILIAS) {
    const css = await (await baixar(familia.css)).text();
    const selecionados = blocos(css).filter((b) => b.url && familia.manter(b));

    if (!selecionados.length) {
      throw new Error(`nenhum bloco woff2 encontrado para ${familia.nome}`);
    }

    for (const bloco of selecionados) {
      const sufixo = bloco.estilo === "normal" ? "" : `-${bloco.estilo}`;
      const arquivo = `${familia.slug}-${bloco.peso}${sufixo}.woff2`;
      const caminho = path.join(DESTINO, arquivo);
      if (fs.existsSync(caminho)) {
        throw new Error(
          `${arquivo} seria escrito duas vezes — filtro de família/peso está deixando passar bloco alheio`,
        );
      }
      const dados = Buffer.from(await (await baixar(bloco.url)).arrayBuffer());
      fs.writeFileSync(caminho, dados);
      bytes += dados.length;
      arquivos++;

      // Uma fonte só, local. O `src` original lista woff2 + woff + ttf e
      // às vezes um `local()` — aqui nada disso serve.
      partes.push(
        bloco.corpo
          .replace(/src:[\s\S]*?;/, `src: url('/fonts/${arquivo}') format('woff2');`)
          .trim(),
      );
      console.log(`  ${arquivo.padEnd(30)} ${(dados.length / 1024).toFixed(0)} kB`);
    }
  }

  const cabecalho = [
    "/* ============================================================",
    " * Fontes da marca, servidas pelo próprio app.",
    " *",
    " * Antes vinham de CDN externo. No APK isso significa primeira",
    " * pintura na fonte do sistema e, sem rede, marca nenhuma.",
    " *",
    " * GERADO por scripts/baixar-fontes.mjs — não editar à mão.",
    " * ============================================================ */",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(DESTINO, "fontes.css"), `${cabecalho}\n${partes.join("\n\n")}\n`);
  console.log(`\n${arquivos} arquivos · ${(bytes / 1024).toFixed(0)} kB`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
