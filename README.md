# 🏥 ClinicaFacil: Sistema de Gestão Inteligente

![Banner](https://img.shields.io/badge/Status-Live_Demo-success?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-React_19_|_TypeScript_|_Supabase-blue?style=for-the-badge)

O **ClinicaFacil** é uma solução completa de Enterprise Resource Planning (ERP) focada na gestão de clínicas médicas e terapias multidisciplinares. O projeto resolve dores reais de agendamento, controle de altas, gestão financeira e acompanhamento de sessões.

---

## 🔗 Demonstração
**Acesse agora:** [https://portfolio-clinicafacil.vercel.app](https://portfolio-clinicafacil.vercel.app)
> No login, utilize o botão **"Acesso para Recrutadores"** para entrar instantaneamente com dados de demonstração.

---

## 🌟 Funcionalidades e Diferenciais

### 🗓️ Gestão de Agendamentos e Escalas
- **Controle de Escala Médica**: Módulo completo para gerenciar a disponibilidade dos profissionais, definindo horários de atendimento e bloqueios.
- **Projeção de Presença (Therapy Patterns)**: Algoritmo que projeta agendamentos futuros para pacientes em terapias continuadas, facilitando a visualização da agenda a longo prazo.
- **Validação de Conflitos**: Sistema inteligente que impede choques de horário e duplicidade de marcações.

### 💰 Gestão Financeira e Faturamento
- **Fluxo de Caixa**: Registro e acompanhamento de pagamentos (Cartão, Dinheiro, PIX).
- **Faturamento SUS vs. Particular**: Separação automática de fluxos financeiros e relatórios de produção para facilitar o repasse e a prestação de contas.

### 📋 Fluxo de Atendimento e Lista de Espera
- **Gestão de Fila de Espera**: Controle rigoroso de pacientes aguardando agendamento, com filtros por urgência e especialidade.
- **Automação de Retornos**: Inteligência que calcula e sugere automaticamente a data ideal para o retorno do paciente, otimizando a ocupação da agenda e a continuidade do tratamento.
- **Painel de Pendências**: Visualização clara de pacientes que precisam de reagendamento ou confirmação de agendamento.

### 🔄 Controle de Volume de Sessões
- **Dashboard de Sessões por Paciente**: Monitoramento em tempo real de quantas sessões o paciente já realizou, quantas restam no plano e quem está próximo da alta.
- **Gestão de Cancelamentos e Ausências**: Sistema para registrar e gerenciar faltas, permitindo um controle financeiro e logístico mais preciso.

### 🛡️ Sistema de Alta Blindada (Destaque Técnico)
- **Bloqueio Seletivo**: Funcionalidade avançada que impede novos agendamentos para especialidades de onde o paciente recebeu alta, mantendo-o livre para outras áreas da clínica.
- **Segurança de Dados (RLS)**: Implementação rigorosa de *Row Level Security* no Postgres, garantindo que profissionais acessem apenas dados pertinentes à sua função.
- **Logs de Auditoria**: Rastreabilidade completa de todas as alterações feitas no sistema (quem alterou, o quê e quando).

---

## 🛠️ Stack Tecnológica

- **Frontend**: React 19 (Hooks, Context API, Vite)
- **Linguagem**: TypeScript (Tipagem estrita em todo o projeto)
- **Backend**: Supabase (PostgreSQL + Realtime + Auth)
- **Estilização**: Tailwind CSS + Lucide Icons
- **UX/UI**: Clean design focado em usabilidade, com feedbacks visuais instantâneos.

---

## 🏗️ Arquitetura e Engenharia
O projeto foi estruturado seguindo princípios de **Clean Code** e **Componentização**, visando escalabilidade. A lógica de negócio é isolada do UI, e o estado global é gerenciado de forma eficiente para garantir uma experiência de usuário (UX) fluida.

---

## 🚀 Como Executar Localmente

1. Clone o projeto: `git clone https://github.com/souzaeulucas/clinicafacil.git`
2. Instale: `npm install`
3. Configure o `.env` com suas chaves do Supabase.
4. Execute: `npm run dev`

---

## 👤 Autor
**Lucas Souza**
- Desenvolvedor focado em soluções Fullstack e Arquitetura de Sistemas.
- [LinkedIn: souzaeulucas](https://www.linkedin.com/in/souzaeulucas/)

---

> Esse projeto é uma demonstração de habilidades técnicas em Fullstack Development e foi construído para resolver problemas reais de fluxo de trabalho clínico.