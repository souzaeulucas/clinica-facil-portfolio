# 🏥 Clínica Fácil

[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://clinicafacil.vercel.app/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)

Sistema completo de gestão de pacientes desenvolvido para resolver problemas reais de organização em uma clínica, substituindo o uso ineficiente de planilhas por uma solução centralizada e inteligente.

---

## 💡 O Problema
Antes do Clínica Fácil, a gestão era baseada em planilhas desorganizadas, com múltiplas abas que dificultavam a separação entre primeira consulta e retornos, gerando perda de tempo e erros de agendamento.

## 🚀 A Solução
O Clínica Fácil centraliza todas as operações em uma aplicação reativa que automatiza processos críticos, desde o controle de faltas até a gestão financeira de sessões de tratamento.

---

## ✨ Principais Funcionalidades

### 👥 Gestão de Pacientes
- **Cadastro Completo**: Edição e exclusão com validação de CPF.
- **Busca Avançada**: Filtros rápidos por nome ou documento direto no banco.
- **Utilidades**: Botões de cópia rápida para CPF, Celular e Nome para agilizar processos externos.

### 📅 Gestão de Agendamentos
- **Triagem Inteligente**: Abas dedicadas para Pendentes (Fila de Espera), Fila SUS e Confirmados.
- **Dashboard Pro**: Visão analítica diária da operação da clínica.
- **Interface Intuitiva**: Cores e ícones que facilitam a leitura rápida do status do paciente.

### ⚙️ Regras de Negócio (Inteligência)
- **🛡️ Sistema de Strikes**: Bloqueio automático de agendamentos após 2 faltas injustificadas.
- **🎓 Controle de Altas**: Bloqueio de agendamentos para especialidades onde o paciente já concluiu o tratamento.
- **📊 Gestão de Sessões**: Controle de sessões autorizadas vs. utilizadas com cálculo automático de saldo e limpeza de órfãos.

### 💬 Integração com WhatsApp
- **Contato Direto**: Botão dedicado para abrir o chat com o paciente em um clique.
- **Agilidade**: Redirecionamento automático com suporte a múltiplos números por paciente.

### 📊 Dashboard Analítico
- Visualização de agendamentos pendentes, urgentes e confirmados.
- Gráficos de volume histórico e métricas de desempenho.

---

## 🧠 Tecnologias e Arquitetura
- **Frontend**: React 19 + TypeScript + Vite.
- **Database**: PostgreSQL (Supabase) com Row Level Security (RLS).
- **Styling**: Tailwind CSS (Design Moderno e Responsivo).
- **Infra**: Deploy contínuo via Vercel.

---

## 🌐 Acesse o sistema
[clinicafacil.vercel.app](https://clinicafacil.vercel.app/)

---
Este projeto é mantido por **Lucas Souza** e reflete a aplicação de boas práticas de desenvolvimento de software em um cenário real.
