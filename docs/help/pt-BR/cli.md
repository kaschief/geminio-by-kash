---
title: A linha de comando
category: Ferramentas do espaço de trabalho
order: 93
summary: `geminio .` abre um repositório — e `geminio doctor` responde sem abrir nada.
keywords: cli linha de comando terminal shim path instalar abrir pasta instancia unica doctor status repos commit-check config editor completions wait core.editor blame show search verbos codigo de saida ci hook
---

# A linha de comando

Do terminal se fazem dois tipos de pergunta, e `geminio` responde às duas.

A primeira é *“me mostre isso”* — você está num clone, algo precisa ser olhado e
o app é o lugar certo para olhar. Essas invocações abrem uma janela, o mais perto
possível daquilo que você pediu.

A segunda é *“me diga agora”* — um hook, um job de CI, ou você, no meio de um
pipe, querendo uma resposta e um código de saída em vez de uma janela. Essas
nunca iniciam o app: escrevem no stdout e saem do caminho.

```sh
geminio .                        # abre esta pasta
geminio blame src/api.ts -l 84   # …no blame daquela linha
geminio doctor                   # sem janela: confere o repo, sai com 1 se falhar
```

## Instalando

Paleta de comandos (<kbd>⌘K</kbd>) → **Instalar o comando 'geminio' no PATH**. No
macOS ele cria um link simbólico para um pequeno shim em `/usr/local/bin` ou
`/opt/homebrew/bin`, pedindo direitos de administrador só se nenhum dos dois for
gravável por você. No Linux vai para `~/.local/bin`, que não exige direito
nenhum. O mesmo comando desinstala. Windows ainda não é suportado.

Depois, se quiser:

```sh
geminio completions zsh >> ~/.zshrc     # ou bash, ou fish
```

## Abrindo coisas

| Comando | Abre |
|---------|------|
| `geminio [caminho]` | O repositório (padrão: a pasta atual) |
| `geminio open <nome>` | Um repositório pelo **nome da aba** — `geminio open api` |
| `geminio diff` | As mudanças não confirmadas |
| `geminio graph` | O grafo de commits |
| `geminio show <ref>` | Um commit — `HEAD~2`, uma tag, um hash curto |
| `geminio blame <arquivo>` | O blame de um arquivo; com `-l 84` você cai numa linha |
| `geminio search <consulta>` | A busca no código, com a consulta já digitada |
| `geminio stack`, `stash`, `reflog`, `conflicts`, `todos`, `chat`, `settings` | Aquele painel |
| `geminio ci`, `clean`, `bisect`, `absorb`, `snapshots`, `insights`, `terminal` | …e assim por diante |

`geminio help verbs` imprime a lista completa. Três opções valem para todos:
`-n <nome>` define o nome exibido da aba, `-g <grupo>` coloca em uma aba de grupo
(criando-a se necessário) e `-l <n>` escolhe uma linha.

Geminio é de **instância única**: rodar `geminio` com o app aberto entrega o
pedido àquela janela em vez de iniciar uma segunda cópia. Um caminho já aberto —
como aba ou dentro de um grupo — recebe **o foco**, e não uma duplicata. Uma
pasta que ainda não é repositório abre mesmo assim, oferecendo o fluxo
“inicializar repositório aqui”.

## Respondendo no terminal

Estes imprimem e encerram. Nenhuma janela abre, e o app nem precisa estar
rodando.

### `geminio status`

Branch, rastreamento, à frente/atrás, árvore de trabalho, stashes e — se o
repositório trouxer uma — a [lista de verificação de push do
`.geminio.json`](repo-config.md). Sai com 1 quando a árvore de trabalho tem
conflitos, então `geminio status || echo bloqueado` funciona.

### `geminio doctor [--fix]`

Roda as mesmas verificações do painel de [configuração do
repositório](repo-config.md): versão do Node, submódulos, LFS,
`core.hooksPath`, arquivos exigidos. **Sai com 1 se alguma falhar**, que é o
ponto — as regras que um repositório declara valem pouco se só quem está com a
interface aberta as vê:

```yaml
- run: geminio doctor          # no CI, antes de qualquer coisa cara
```

`--fix` aplica os reparos que o doutor sabe fazer (inicializar submódulos,
`lfs pull`, definir `core.hooksPath`, copiar um arquivo do seu exemplo) e
verifica de novo. Ele nunca executa um comando fornecido pela configuração — o
conjunto de reparos é fechado.

Avisos não fazem a execução falhar. Um aviso significa que o doutor não conseguiu
determinar algo, não que algo esteja errado, e reprovar builds por isso tornaria
o arquivo caro demais de adotar.

### `geminio commit-check [arquivo]`

Analisa uma mensagem de commit. Sem argumento lê `.git/COMMIT_EDITMSG`;
`-m "…"` analisa uma string. Ele sabe o que o repositório declarou: um escopo
desconhecido é **erro** quando `.geminio.json` lista escopos, e apenas conselho
de estilo quando não lista. Ligue-o a um hook:

```sh
# .husky/commit-msg
geminio commit-check "$1"
```

### `geminio config init | show | check`

`init` lê o repositório e propõe um `.geminio.json` a partir do que já existe —
`.nvmrc`, `.gitmodules`, um `.env.example` sem `.env`, os escopos de commit que o
histórico vem usando. `--dry-run` imprime em vez de escrever. `show` imprime o
arquivo atual; `check` valida e lista qualquer campo que seria descartado.

### `geminio repos [filtro]`

Todo repositório que o Geminio conhece — abas abertas primeiro, depois os
recentes — com seu grupo. `--paths` imprime caminhos puros, um por linha, para
scripts:

```sh
cd "$(geminio repos --paths api | head -1)"
```

## Geminio como editor do git

```sh
geminio editor install
```

define `core.editor` e `sequence.editor` como `geminio --wait`. A partir daí
`git commit` (sem `-m`), `git commit --amend`, `git tag -a` e `git rebase -i`
abrem seu arquivo no Geminio em vez do vim, com contador de caracteres e as
mesmas dicas de mensagem que o compositor mostra.

![O editor que o Geminio abre quando o git pede um](../../screenshots/cli-edit.webp)

A palavra que importa é **esperando**: o git está bloqueado nesse diálogo. Então

- **Salvar e continuar** grava o arquivo de volta e o git segue.
- **Cancelar** grava um arquivo vazio, que o git lê como *abortar*.
- Fechar o diálogo de qualquer outra forma — Esc, o fundo, encerrar o Geminio —
  conta como Cancelar. Um terminal esperando para sempre seria bem pior que uma
  mensagem para redigitar.

Adicione `--local` para limitar a um repositório, e desfaça com
`geminio editor uninstall`.

## O que ele não faz

- **Nenhum verbo de terminal modifica o repositório.** `doctor --fix` é a única
  exceção, e seus reparos são uma lista fixa, não algo que um arquivo de
  configuração possa estender.
- **`repos` é somente leitura.** O app em execução é dono do seu arquivo de
  configurações; a CLI lê e nunca escreve.
- **Um verbo que o app instalado não conhece é ignorado**, não recusado — um shim
  mais novo contra um app mais velho ainda abre o repositório.
- **Windows ainda não tem shim.** Os verbos estão todos implementados; falta só o
  caminho de instalação.

**Veja também:** [Espaços de trabalho, abas e grupos](workspaces.md) ·
[Configuração do repositório](repo-config.md) · [Fazendo commits](committing.md)
