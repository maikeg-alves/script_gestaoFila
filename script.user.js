// ==UserScript==
// @name         Script Gestão de Fila
// @namespace    http://tampermonkey.net/
// @version      2.2.0
// @description  Script de gestão de filas, opa - via fiber
// @author       Maicon Gabriel Alves
// @match        https://opasuite.viafiberinternet.com.br/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/maikeg-alves/script_gestaoFila/main/script.meta.js
// @downloadURL  https://github.com/maikeg-alves/script_gestaoFila/releases/latest/download/script.user.js
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

const BASE_URL = "https://api.viafiber.duckdns.org";

const DEBUG_LOGS = false;

const logger = new Logger();

const INTERVALO_VERIFICACAO_FILA_MS = 16 * 60 * 1000; // 5 minutos

let intervaloVerificacao = 1500;

let consultandoAtendimentos = false;

const TAMANHO_LOTES = 10; // quantidade de chamadas na api por minutos

const atendimentosCache = {}; // atedndmentos armazenados localmente

const atendimentosObservados = []; // atendimentos que foram abertos

const atendimentosComErro = []; // atendimentos que deram erro ao buscar

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

logger.desativarLogs(DEBUG_LOGS);

(() => {
  "use strict";

  console.time("[Opa] Tempo de execução");
  console.timeEnd("[Opa] Tempo de execução");

  runScript();

  setInterval(runScript, intervaloVerificacao);

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
      if (!list || !dialog) {
        logger.error(
          "[observeContainer] Erro: Elementos da observação não encontrados."
        );
        return;
      }

      if (list && dialog) {
        for (const id_atendimento of atendimentosObservados) {
          logger.log(
            "[observeContainer] Atendimento observado:",
            id_atendimento
          );
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
      if (error instanceof DOMException) {
        logger.error(
          "[observeContainer] Erro ao selecionar elemento:",
          error.message
        );
      } else if (error instanceof TypeError) {
        logger.error(
          "[observeContainer]  Erro ao acessar propriedade:",
          error.message
        );
      } else {
        logger.error("[observeContainer] Erro desconhecido:", error.message);
      }
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
      logger.log(
        `[getListClintes] : Atendimentos pendentes: ${atendimentosPendentes.length}`
      );

      if (atendimentosPendentes.length > 30) {
        await processarAtendimentosLotes(atendimentosPendentes, list);
      } else if (atendimentosPendentes.length < 30) {
        await getAtendimentoById(atendimentosPendentes, list);
      }
    } else {
      logger.log(
        `Atendimentos em cache: ${Object.keys(atendimentosCache).length}`
      );

      signalAtendimentoFromCache(list);
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
    },
    body: JSON.stringify({
      atendimentos: idsAtendimentos,
    }),
  };

  consultandoAtendimentos = true;

  await fetch(`${BASE_URL}/atendimento/status`, options)
    .then((response) => response.json())
    .then((alertas) => {
      if (alertas.length) {
        logger.log("[Busca Atendimento] Consulta realizada com sucesso.");
      }

      updateCache(alertas);
      signalAtendimento(alertas, list);
    })
    .catch((error) => {
      if (error instanceof NetworkError) {
        logger.error("[Busca Atendimento] Erro de rede:", error.message);
      } else if (error instanceof SyntaxError) {
        logger.error(
          "[Busca Atendimento] Erro ao decodificar JSON:",
          error.message
        );
      } else {
        logger.error(
          "[Busca Atendimento] Erro desconhecido ao consultar atendimentos: " +
            idsAtendimentos,
          error.message
        );
      }
    })
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

      if (alertaFilter.tipo_espera === "cliente_esperando_resposta") {
        elemento.classList.add("pulso");
      } else if (alertaFilter.tipo_espera === "atendente_esperando_resposta") {
        const notifDiv = elemento.querySelector("div.notif");
        if (notifDiv) {
          const WhatsappIcon = notifDiv.querySelector("i");
          const AlertUser = notifDiv.querySelector("i.AlertUser");

          if (WhatsappIcon && !AlertUser) {
            WhatsappIcon.style.display = "none";
            const novoI = document.createElement("i");
            novoI.classList.add("AlertUser");
            notifDiv.appendChild(novoI);
          }
        }
      } else {
        elemento.classList.remove("pulso");
        const notifDiv = elemento.querySelector("div.notif");
        if (notifDiv) {
          const WhatsappIcon = notifDiv.querySelector("i");
          const AlertUser = notifDiv.querySelector("i.AlertUser");
          if (WhatsappIcon && AlertUser) {
            WhatsappIcon.style.display = "";
            AlertUser.remove();
          }
        }
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

      const filterAlerta =
        alerta.status != "ocioso" && alerta.status != "ativo";

      if (filterAlerta && alerta.tipo_espera === "cliente_esperando_resposta") {
        elemento.classList.add("pulso");
      } else if (
        filterAlerta &&
        alerta.tipo_espera === "atendente_esperando_resposta"
      ) {
        const notifDiv = elemento.querySelector("div.notif");
        if (notifDiv) {
          const WhatsappIcon = notifDiv.querySelector("i");
          const AlertUser = notifDiv.querySelector("i.AlertUser");

          if (WhatsappIcon && !AlertUser) {
            WhatsappIcon.style.display = "none";
            const novoI = document.createElement("i");
            novoI.classList.add("AlertUser");
            notifDiv.appendChild(novoI);
          }
        }
      } else {
        elemento.classList.remove("pulso");
        const notifDiv = elemento.querySelector("div.notif");
        if (notifDiv) {
          const WhatsappIcon = notifDiv.querySelector("i");
          const AlertUser = notifDiv.querySelector("i.AlertUser");
          if (WhatsappIcon && AlertUser) {
            WhatsappIcon.style.display = "";
            AlertUser.remove();
          }
        }
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
// remove o atendimento da cache para verificar se existe o mesmo está ativo
async function verificarAtendimentoAtivo(dialog, id_atendimento, list) {
  logger.log("[verificarAtendimentoAtivo] Verificando Atendimento.");

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

            if ([id_atendimento].length) {
              await getAtendimentoById([id_atendimento], list);
            } else {
              logger.error(
                "[verificarAtendimentoAtivo] idsAtendimentos não é um array de ids"
              );
            }
          }
        } else {
          logger.log("[verificarAtendimentoAtivo] Atendimento ativo.");
          if (atendimentoCache && atendimentoCache.status === "pendente") {
            delete atendimentosCache[id_atendimento];
            if ([id_atendimento].length) {
              await getAtendimentoById([id_atendimento], list);
            } else {
              logger.error(
                "[verificarAtendimentoAtivo] idsAtendimentos não é um array de ids"
              );
            }
          }
        }
      }
    }
  } else {
    logger.log(`Atendimento inativo encontrado para o ID: ${id_atendimento}`);
  }
}

// lida com a chamada dos atendimentos em lotes
async function processarAtendimentosLotes(atendimentosIds, list) {
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
          if ([idAtendimento].length) {
            await getAtendimentoById([idAtendimento], list);
          } else {
            logger.error(
              "[processarAtendimentosLotes] idsAtendimentos não é um array de ids"
            );
          }
        } catch (error) {
          atendimentosComErro.push(idAtendimento);
        }
      })
    );

    intervaloVerificacao += 500;

    start += batchSize;
  }

  await retryFailedAtendimentos(list);

  intervaloVerificacao = 1500;

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
      intervaloVerificacao += 500;

      if ([idAtendimento].length) {
        await getAtendimentoById([idAtendimento], list);
      } else {
        logger.error(
          "[retryFailedAtendimentos] idsAtendimentos não é um array de ids"
        );
      }
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

  intervaloVerificacao = 1500;

  if (atendimentosComErro.length > 0) {
    logger.error("Atendimentos com erro:");
    for (const id of atendimentosComErro) {
      logger.error(`> ${id}`);
    }
  }
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

                @keyframes AlertUserAnimation {
                  0% {
                    background-color: inherit;
                    
                  }
                 50% {
                    background-color: #ff9e00;
                   
                   }
                100% {
                    background-color: inherit;
                  } 
                }
                
                .pulso {
                    animation: pulso 1s infinite;
                }

                .AlertUser {
                  position: absolute;
                  background: #ff9e00;
                  border-radius: 10pc;
                  color: #ff9700;
                  width: 13px;
                  height: 13px;
                  right: 1px;
                  animation: AlertUserAnimation 1.5s infinite;
                }
            `;
    document.body.appendChild(style);

    // Adiciona uma classe ao corpo da página para indicar que o estilo foi adicionado
    document.body.classList.add("style-added");
  }
}
