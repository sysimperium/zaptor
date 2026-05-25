# Spec Técnico — Fluxo de Git e Commits
> Projeto: ZapTor  
> Data: Maio/2026  
> Status: v2.0

---

## 1. Visão Geral

Este documento define as regras para o uso do Git e GitHub no projeto ZapTor, visando manter um histórico limpo, rastreável e integrado ao fluxo de deploy.

---

## 2. Estratégia de Branches

Seguiremos o modelo de **Git Flow simplificado**:

| Branch | Finalidade | Regras |
| :--- | :--- | :--- |
| `main` | Produção | Commits direto em produção. |
| `feat/*` | Novas funcionalidades | Branches temporárias para tarefas específicas (ex: `feat/auth-routes`). |
| `fix/*` | Correções de bugs | Para correções rápidas em desenvolvimento ou produção. |
| `infra/*` | Mudanças de infra | Docker, scripts de deploy, etc. |

---

## 3. Padrão de Commits (Conventional Commits)

Utilizaremos o padrão **Conventional Commits** para mensagens claras e automatizáveis:

**Formato:** `<tipo>(escopo): <descrição curta em português>`

### Tipos permitidos:
- `feat`: Novo recurso (ex: `feat(auth): implementar login com jwt`)
- `fix`: Correção de bug
- `docs`: Documentação (ex: `docs(infra): adicionar spec de git`)
- `refactor`: Mudança de código que não corrige bug nem adiciona recurso
- `infra`: Alterações em Docker, CI/CD ou pastas de infra
- `chore`: Atualização de pacotes, configurações de build, etc.
- `ci`: Alterações nos arquivos de configuração do GitHub Actions

---

## 4. Granularidade e Boas Práticas

1.  **Commits Atômicos:** Cada commit deve representar uma única unidade lógica de trabalho. Se um arquivo resolve duas coisas diferentes, faça dois commits.
2.  **Mensagens no Presente:** "Adiciona rota x" em vez de "Adicionei rota x".
3.  **Não commitar arquivos sensíveis:** O `.env` e pastas como `node_modules` e `dist` devem estar sempre no `.gitignore`.
4.  **Revisão de Código:** Commits feitos pelo agente devem ser revisados e validados por testes antes de serem considerados "finais".

---

## 5. Fluxo de Trabalho do Agente

1.  **Stage:** Adicionar apenas os arquivos relacionados à mudança específica.
2.  **Commit:** Seguir o padrão acima rigorosamente.
3.  **Push:** Subir para a branch de trabalho atual.
