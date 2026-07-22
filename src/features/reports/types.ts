export interface LaudoFoto {
  id: string
  nomeArquivo: string
  url: string
}

/** Dados já resolvidos (inclusive URLs assinadas de foto) para o laudo em PDF de uma AVU. */
export interface AvuLaudoData {
  numeroAvu: string
  descricao: string
  dataCriacao: string
  dataConclusao: string | null
  responsavelNome: string
  ordemManutencao: string | null
  notaSap: string | null
  conclusao: string
  fotosAntes: LaudoFoto[]
  fotosDepois: LaudoFoto[]
}
