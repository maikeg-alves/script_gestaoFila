// ==UserScript==
// @name         Script Gestão de Fila
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Script de gestão de filas, opa - via fiber
// @author       Maicon Gabriel Alves
// @match        https://opasuite.viafiberinternet.com.br/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @run-at       document-start
// @grant        none
// @updateURL    https://f187-200-107-118-1.ngrok-free.app/repo/maikeg-alves/script_gestaoFila/script.meta.js?token=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
// @downloadURL  https://f187-200-107-118-1.ngrok-free.app/repo/maikeg-alves/script_gestaoFila/script.user.js?token=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
// ==/UserScript==

class Logger {
  constructor() {
    this.logsAtivos = true;
  }

  log(message) {
    if (this.logsAtivos) {
      console.log(`[LOG] ${message}`);
    }
  }

  logError(message) {
    if (this.logsAtivos) {
      console.error(`[ERROR] ${message}`);
    }
  }

  debug(message) {
    if (this.logsAtivos) {
      console.debug(`[DEBUG] ${message}`);
    }
  }

  error(message) {
    if (this.logsAtivos) {
      console.error(`[ERROR] ${message}`);
    }
  }

  desativarLogs(_parametro) {
    this.logsAtivos = _parametro;
  }
}

console.log(`[Opa] readyState: ${document.readyState}`);

<<<<<<< HEAD
console.log("ATUALIZAÇÂO PELO GITHUB 1.0.1");
=======
const BASE_URL = "http://localhost:3000";
>>>>>>> dev

const logger = new Logger();

const INTERVALO_VERIFICACAO_FILA_MS = 16 * 60 * 1000; // 5 minutos

const TAMANHO_LOTES = 10; // quantidade de chamadas na api por minutos

const atendimentosCache = {}; // atedndmentos armazenados localmente

const atendimentosObservados = []; // atendimentos que foram abertos

const atendimentosComErro = []; // atendimentos que deram erro ao buscar

const LOGS_STATUS = true; // desabilitar os LOGS

let consultandoAtendimentos = false;

const tempoAtual = new Date();
const TEMPOLIMITE = 15;

// lista o conatiner geral que ingloba os atributos
const CONTAINER_ID = "#container";

// define a coluna onde tem so atendimentos
const LIST_CLASS = "div.list";

const DIALOG_CLASS = "div.dialog";

// conatiner que engloba os atendimentos, setando o atributo de cada elemento do atendimento
const ATENDIMENTOS_CLASS = "div.list_dados > [data-id]";

// seta o os ids de dentro dos atendimentos
const ATENDIMENTO_ATRIBUTO_ID = "[data-id]";

const DATA_ID = "data-id";

logger.desativarLogs(LOGS_STATUS);

(() => {
  "use strict";

  console.time("[Opa] Tempo de execução");
  console.timeEnd("[Opa] Tempo de execução");

  runScript();

  setInterval(runScript, 500);

  atualizarCachePeriodicamente();

  setInterval(atualizarCachePeriodicamente, INTERVALO_VERIFICACAO_FILA_MS);
})();

async function runScript() {
  await new Promise((resolve) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", resolve);
    } else {
      resolve();
    }
  });

  const CONTAINER_SELECTOR = document.querySelector(CONTAINER_ID);

  observeContainer(CONTAINER_SELECTOR)
    .then(async ({ list, dialog }) => {
      if (list && dialog) {
        for (const id_atendimento of atendimentosObservados) {
          logger.log("Atendimento observado:", id_atendimento);
          await verificarAtendimentoAtivo(dialog, id_atendimento, list);
        }

        const dialogElemento = dialog.querySelector("div.dialog_panel");
        if (dialogElemento) {
          const id_atendimento = dialogElemento.getAttribute(DATA_ID);

          if (!atendimentosObservados.includes(id_atendimento)) {
            atendimentosObservados.push(id_atendimento);
            logger.log("Atendimento selecionado:", id_atendimento);
            await verificarAtendimentoAtivo(dialog, id_atendimento, list);
          }
        }

        getListClintes(list);
      }
    })
    .catch((error) => {
      logger.error("Erro ao observar o contêiner:", error);
    });
}

// limpa o cache para forçar a atualização dos dados
function atualizarCachePeriodicamente() {
  if (Object.keys(atendimentosCache).length === 0) {
    return;
  }

  logger.log("Atualizando dados do cache periodicamente...");

  // Obter todos os atendimentos pendentes no cache
  const atendimentosPendentes = Object.keys(atendimentosCache).filter(
    (id) =>
      atendimentosCache[id].status === "pendente" ||
      atendimentosCache[id].status === "ocioso"
  );

  // Remover os atendimentos pendentes do cache
  atendimentosPendentes.forEach((id) => delete atendimentosCache[id]);
}

// seleciona a ista de atendimentos da interface do opa
async function getListClintes(list) {
  const elementos = list.querySelectorAll(ATENDIMENTOS_CLASS);
  const idsAtendimentos = Array.from(elementos).map((elemento) =>
    elemento.getAttribute(DATA_ID)
  );

  if (elementos.length === idsAtendimentos.length) {
    const atendimentosPendentes = idsAtendimentos.filter(
      (id) => !atendimentosCache[id]
    );

    if (atendimentosPendentes.length > 0) {
      logger.log(`Atendimentos pendentes: ${atendimentosPendentes.length}`);

      if (atendimentosPendentes.length > 30) {
        await processarAtendimentos(atendimentosPendentes, list);
      } else {
        await getAtendimentoById(atendimentosPendentes, list);
      }
    } else {
      signalAtendimentoFromCache(list);
      logger.log(
        `Atendimentos em cache: ${Object.keys(atendimentosCache).length}`
      );
    }
  } else {
    logger.error(
      "Erro: número de elementos não corresponde ao número de IDs de atendimentos."
    );
  }
}

// consuta os atendimentos selecionados no banco
async function getAtendimentoById(idsAtendimentos, list) {
  if (consultandoAtendimentos) {
    return;
  }

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "insomnia/8.6.1",
    },
    body: JSON.stringify({
      atendimentos: idsAtendimentos,
    }),
  };

  consultandoAtendimentos = true;

  await fetch(`${BASE_URL}/atendimento/status`, options)
    .then((response) => response.json())
    .then((alertas) => {
      logger.log("Consulta realizada com sucesso.");
      updateCache(alertas);
      signalAtendimento(alertas, list);
    })
    .catch((error) =>
      logger.error("Erro ao consultar atendimentos:", error.message)
    )
    .finally(() => {
      consultandoAtendimentos = false;
    });
}

// atribui o efeito de pulso nos atendimentos pendentes
function signalAtendimento(alertas, list) {
  logger.log("dados carregados da api");

  if (list) {
    const elementos = list.querySelectorAll(ATENDIMENTOS_CLASS);

    elementos.forEach((elemento) => {
      const idAtendimento = elemento.getAttribute(ATENDIMENTO_ATRIBUTO_ID);
      const alertaFilter = alertas.find(
        (alerta) =>
          alerta.id_atendimento === idAtendimento &&
          alerta.status != "ocioso" &&
          alerta.status != "ativo"
      );
      if (alertaFilter) {
        elemento.classList.add("pulso");
      } else {
        elemento.classList.remove("pulso");
      }
    });
  }
}

// Atualiza o cache com os novos resultados das consultas de atendimentos pendentes
function updateCache(alertas) {
  logger.log("Atualizando cache com novos dados.");

  alertas.forEach((alerta) => {
    atendimentosCache[alerta.id_atendimento] = alerta;
  });

  logger.log("Dados salvos no cache com sucesso.");
}

// Atualiza os elementos na lista com base nos dados armazenados em cache
function signalAtendimentoFromCache(list) {
  if (list) {
    const elementos = list.querySelectorAll("div.list_dados > [data-id]");

    elementos.forEach((elemento) => {
      const idAtendimento = elemento.getAttribute(DATA_ID);
      const alerta = atendimentosCache[idAtendimento];
      if (alerta && alerta.status != "ocioso" && alerta.status != "ativo") {
        elemento.classList.add("pulso");
      } else {
        elemento.classList.remove("pulso");
      }
    });
  }
}

// Observa as mudanças dos componentes na pagina
function observeContainer(container) {
  return new Promise((resolve, reject) => {
    let list;
    let dialog;

    const checkContainer = () => {
      const setList = container.querySelector(LIST_CLASS);

      if (setList) {
        list = setList;
        // Verifica a existência do diálogo apenas se a lista estiver presente
        const setDialog = container.querySelector(DIALOG_CLASS);

        if (setDialog) {
          dialog = setDialog;
        }
        // Resolve a Promise apenas quando a lista está presente, o diálogo é opcional
        resolve({ list, dialog });
        observer.disconnect();
      }
    };

    // Criar um observador de mutação para observar mudanças no contêiner
    const observer = new MutationObserver((mutationsList, observer) => {
      for (let mutation of mutationsList) {
        if (mutation.type === "childList" || mutation.type === "subtree") {
          checkContainer();
          break;
        }
      }
    });

    // adiciona o style global no body da pagina, classe pulse
    addStylePage();

    // Observar o contêiner
    observer.observe(container, { childList: true, subtree: true });

    // Verificar o contêiner uma vez para o caso de já conter a lista
    checkContainer();
  });
}

// adiciona o css com efeito de pulso na pagina
function addStylePage() {
  if (!document.body.classList.contains("style-added")) {
    // Adiciona estilo CSS diretamente ao corpo da página
    const style = document.createElement("style");
    style.textContent = `
                @keyframes pulso {
                    0% {
                        background-color: inherit;
                    }
                    50% {
                        background-color: #431515
                    }
                    100% {
                        background-color: inherit;
                    }
                }
                
                .pulso {
                    animation: pulso 1s infinite; /* Altere a duração conforme necessário */
                }
            `;
    document.body.appendChild(style);

    // Adiciona uma classe ao corpo da página para indicar que o estilo foi adicionado
    document.body.classList.add("style-added");
  }
}

// remove o atendimento da cache para verificar se existe o mesmo está ativo
async function verificarAtendimentoAtivo(dialog, id_atendimento, list) {
  logger.log("Verificando Atendimento.");

  const chatAberto = dialog.querySelector(
    `div.dialog_panel[data-id="${id_atendimento}"]`
  );

  if (chatAberto) {
    const list_dialog = dialog.querySelectorAll(
      "div.dialog_dados > div.corpo > div"
    );

    if (list_dialog) {
      const now = new Date();
      const nowUTC = now.getTime() + now.getTimezoneOffset() * 60000;

      const ultimaMensagem = list_dialog[list_dialog.length - 1];
      const mensagemTime = ultimaMensagem.getAttribute("data-time");

      if (mensagemTime) {
        const atendimentoCache = atendimentosCache[id_atendimento];
        const mensagemTimeValue = new Date(mensagemTime);
        const mensagemTimeUTC =
          mensagemTimeValue.getTime() +
          mensagemTimeValue.getTimezoneOffset() * 60000;

        // Calcula a diferença em minutos entre o tempo atual e o tempo da mensagem
        const milisegundos = nowUTC - mensagemTimeUTC;
        const diferencaMinutos = milisegundos / (1000 * 60);

        if (diferencaMinutos >= TEMPOLIMITE) {
          logger.log("Atendimento pendente.");

          if (atendimentoCache && atendimentoCache.status === "ativo") {
            logger.log("Removendo atendimento ativo expirado.");

            const index = atendimentosObservados.indexOf(id_atendimento);
            if (index !== -1) {
              atendimentosObservados.splice(index, 1);
            }

            delete atendimentosObservados[id_atendimento];
            await getAtendimentoById([id_atendimento], list);
          }
        } else {
          logger.log("Atendimento ativo.");
          if (atendimentoCache && atendimentoCache.status === "pendente") {
            delete atendimentosCache[id_atendimento];
            await getAtendimentoById([id_atendimento], list);
          }
        }
      }
    }
  } else {
    logger.log("Atendimento inativo encontrado para o ID:", id_atendimento);
  }
}

// lida com a chamada dos atendimentos em lotes
async function processarAtendimentos(atendimentosIds, list) {
  const batchSize = Number(TAMANHO_LOTES);
  let start = 0;

  while (start < atendimentosIds.length) {
    const end = Math.min(start + batchSize, atendimentosIds.length);
    const batchIds = atendimentosIds.slice(start, end);

    logger.log(`Processando atendimentos de ${start + 1} a ${end}`);

    // Processar o lote de atendimentos
    await Promise.all(
      batchIds.map(async (idAtendimento) => {
        try {
          await getAtendimentoById([idAtendimento], list);
        } catch (error) {
          atendimentosComErro.push(idAtendimento);
        }
      })
    );

    start += batchSize;
  }

  await retryFailedAtendimentos(list);

  logger.debug("Processamento de atendimentos concluído.");
}

// recupera atendimentos que deram erro no momento da chaamda
async function retryFailedAtendimentos(list) {
  if (atendimentosComErro.length === 0) {
    logger.log("Nenhum atendimento com erro para tentar novamente.");
    return;
  }

  logger.error(
    `Tentando novamente ${atendimentosComErro.length} atendimentos com erro.`
  );

  // Processar novamente os atendimentos com erro
  for (const idAtendimento of atendimentosComErro) {
    try {
      await getAtendimentoById([idAtendimento], list);
      const index = atendimentosComErro.indexOf(idAtendimento);
      if (index !== -1) {
        atendimentosComErro.splice(index, 1);
      }
    } catch (error) {
      console.error(
        `Erro ao processar novamente o atendimento ${idAtendimento}: ${error.message}`
      );
    }
  }

  logger.log("Tentativa de reprocessamento de atendimentos concluída.");

  if (atendimentosComErro.length > 0) {
    logger.error("Atendimentos com erro:");
    for (const id of atendimentosComErro) {
      logger.error(`> ${id}`);
    }
  }
}
