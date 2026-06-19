## Ajustes necessarios para o sistema
- Segue as anotações do que deve ser feito no sistema para conclusão da aplicação. Lembrando que deve seguir as normas de commit presentes no arquivo `.gemini/SPEC-GIT-WORKFLOW.md`. Não tem a necessidade de enviar para o github a cada alteração (executar o `git push`), commit tudo e ao final das changes, envie para o repositorio remoto.

## Precisamos melhor a questão do multi-tentant do ZappTor (mudança do nome de ZapTor para ZappTor

 - A intenção do ZappTor é ser multi-tentand, e escalonar para varias empresas, então precisamos melhorar a maneira da criação da empresa, root... essa criação da empresa precisa ser feita, antes de "entrar" no zap:

-- O root criará a empresa
	- Com a empresa criada
		- Define qual o numero do celular que usará o zapptor (o numero do telefone também servirá para limitar o uso do sistema zapptor para que não fique usando varios numneros (somente usara vartios numertos de o plano permitir
		- Define o nome do usuario principal (admin) que irá criar os usuarios e as equipes
			Na criação do usuario principal (admin) pelo ROOT deve ter a opção de colocar o nome desse usuario e a senha dele (um cadastro completo com numero de contato whatsapp) e data de vencimento da mensalidades esse usuario principal terá um dashboard
			Na criação das equipes, caso o plano assinado tenha permissão, aparece para o admin no momento da criação (as equipes podem ser criadas momento da criação dos usuadios, ou depois, se no caso as equpes sejam criadas depois, terá uma opção de apontar quais os membros são de quais equipes 
		- Os membros das equipes podem falar entre si, para isso pensei na possibilidade de usar pelo proprio whatsapp quando se manda mensagem para si mesmo, nesse caso seria escolhido, um membro da equipe e enviaria a mensagem para o proprio numero, a o membro da equipe selecioando seria notificado.

O root também terá um dashbord mostrando quais os tentans criados e com a opçção de criar mais tentants (empresas) que usarão o zapptor

Ainda temos que criar um local para geração das mensalidades (pelo root) e essas mensalidades geeradas devem aparecer no dashbord do admin
As mensalidades deve, ter status (com cores diferentes) agendadas (quando geradas dos meses futuros),  

Fazer uma unica tela de login (essa tela dever ser antes de acessar o whatsapp que pelo usaurio redireciona para o correto se root (criação de admins), se admin (criação dos usuarios e equipes), se apenas usuario já entra no zapptor (whatsapp) 


Seria possive, na "assinatura" do usaurio na conversas sair o nome e a equipe com a opção de escoher pelo admin se vai usar apenas o nome ou o nome e a equipe, na assinatura:
Ex.:

 - Se escolhida a opção enviar nome e equipe, ficaria assim:
*Nome Usuario*
_nome equipe_:
Texto da mensagem enviada



 - Se escolhida a opção enviar apenas o nome, ficaria assim:
*Nome Usuario*
Texto da mensagem enviada
 

		- 
Obs.:

Usar a logo.png que está na pasta raiz \imgs\


 --- PLANOS ZAPPTOR E PREÇOS ---

ZappTor START (Plano inicial) - R$ 79,00

 - 1 Numero de Celular
 - 10 Usuarios
 - Sem equipe

ZappTor TEAM - R$ 149,00

 - 1 Numero de Celular
 - 20 Usuarios
 - Com equipes (2 no maximo)

ZappTor BUSINESS - R$ 249,00

 - 2 Numero de Celular
 - 40 Usuarios
 - Até 4 equipes

ZappTor ENTERPRISE - R$ 399,00

 - 10 Numero de Celulare
 - 80+ Usuarios (ilimitado)
 - Equipes ilimitadas
