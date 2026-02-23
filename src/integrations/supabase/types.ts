export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bagagem: {
        Row: {
          conferido: boolean
          created_at: string
          id: string
          item: string
          quantidade: number
          updated_at: string
          user_id: string
          viagem_id: string
        }
        Insert: {
          conferido?: boolean
          created_at?: string
          id?: string
          item: string
          quantidade?: number
          updated_at?: string
          user_id: string
          viagem_id: string
        }
        Update: {
          conferido?: boolean
          created_at?: string
          id?: string
          item?: string
          quantidade?: number
          updated_at?: string
          user_id?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bagagem_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas: {
        Row: {
          categoria: string | null
          created_at: string
          data: string | null
          id: string
          moeda: string | null
          titulo: string
          updated_at: string
          user_id: string
          valor: number
          viagem_id: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          data?: string | null
          id?: string
          moeda?: string | null
          titulo: string
          updated_at?: string
          user_id: string
          valor: number
          viagem_id: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          data?: string | null
          id?: string
          moeda?: string | null
          titulo?: string
          updated_at?: string
          user_id?: string
          valor?: number
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "despesas_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          arquivo_url: string | null
          created_at: string
          id: string
          nome: string
          tipo: string | null
          updated_at: string
          user_id: string
          viagem_id: string
        }
        Insert: {
          arquivo_url?: string | null
          created_at?: string
          id?: string
          nome: string
          tipo?: string | null
          updated_at?: string
          user_id: string
          viagem_id: string
        }
        Update: {
          arquivo_url?: string | null
          created_at?: string
          id?: string
          nome?: string
          tipo?: string | null
          updated_at?: string
          user_id?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      hospedagens: {
        Row: {
          atracoes_proximas: string | null
          check_in: string | null
          check_out: string | null
          como_chegar: string | null
          created_at: string
          dica_ia: string | null
          dica_viagem: string | null
          id: string
          localizacao: string | null
          moeda: string | null
          nome: string | null
          restaurantes_proximos: string | null
          status: Database["public"]["Enums"]["reserva_status"]
          updated_at: string
          user_id: string
          valor: number | null
          viagem_id: string
        }
        Insert: {
          atracoes_proximas?: string | null
          check_in?: string | null
          check_out?: string | null
          como_chegar?: string | null
          created_at?: string
          dica_ia?: string | null
          dica_viagem?: string | null
          id?: string
          localizacao?: string | null
          moeda?: string | null
          nome?: string | null
          restaurantes_proximos?: string | null
          status?: Database["public"]["Enums"]["reserva_status"]
          updated_at?: string
          user_id: string
          valor?: number | null
          viagem_id: string
        }
        Update: {
          atracoes_proximas?: string | null
          check_in?: string | null
          check_out?: string | null
          como_chegar?: string | null
          created_at?: string
          dica_ia?: string | null
          dica_viagem?: string | null
          id?: string
          localizacao?: string | null
          moeda?: string | null
          nome?: string | null
          restaurantes_proximos?: string | null
          status?: Database["public"]["Enums"]["reserva_status"]
          updated_at?: string
          user_id?: string
          valor?: number | null
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospedagens_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      preparativos: {
        Row: {
          concluido: boolean
          created_at: string
          descricao: string | null
          id: string
          titulo: string
          updated_at: string
          user_id: string
          viagem_id: string
        }
        Insert: {
          concluido?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          titulo: string
          updated_at?: string
          user_id: string
          viagem_id: string
        }
        Update: {
          concluido?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          titulo?: string
          updated_at?: string
          user_id?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preparativos_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          nome: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      restaurantes: {
        Row: {
          cidade: string | null
          created_at: string
          id: string
          nome: string
          rating: number | null
          salvo: boolean
          tipo: string | null
          updated_at: string
          user_id: string
          viagem_id: string
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          id?: string
          nome: string
          rating?: number | null
          salvo?: boolean
          tipo?: string | null
          updated_at?: string
          user_id: string
          viagem_id: string
        }
        Update: {
          cidade?: string | null
          created_at?: string
          id?: string
          nome?: string
          rating?: number | null
          salvo?: boolean
          tipo?: string | null
          updated_at?: string
          user_id?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurantes_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          categoria: string | null
          concluida: boolean
          created_at: string
          id: string
          prioridade: Database["public"]["Enums"]["tarefa_prioridade"]
          titulo: string
          updated_at: string
          user_id: string
          viagem_id: string
        }
        Insert: {
          categoria?: string | null
          concluida?: boolean
          created_at?: string
          id?: string
          prioridade?: Database["public"]["Enums"]["tarefa_prioridade"]
          titulo: string
          updated_at?: string
          user_id: string
          viagem_id: string
        }
        Update: {
          categoria?: string | null
          concluida?: boolean
          created_at?: string
          id?: string
          prioridade?: Database["public"]["Enums"]["tarefa_prioridade"]
          titulo?: string
          updated_at?: string
          user_id?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      transportes: {
        Row: {
          created_at: string
          data: string | null
          destino: string | null
          id: string
          moeda: string | null
          operadora: string | null
          origem: string | null
          status: Database["public"]["Enums"]["reserva_status"]
          tipo: string | null
          updated_at: string
          user_id: string
          valor: number | null
          viagem_id: string
        }
        Insert: {
          created_at?: string
          data?: string | null
          destino?: string | null
          id?: string
          moeda?: string | null
          operadora?: string | null
          origem?: string | null
          status?: Database["public"]["Enums"]["reserva_status"]
          tipo?: string | null
          updated_at?: string
          user_id: string
          valor?: number | null
          viagem_id: string
        }
        Update: {
          created_at?: string
          data?: string | null
          destino?: string | null
          id?: string
          moeda?: string | null
          operadora?: string | null
          origem?: string | null
          status?: Database["public"]["Enums"]["reserva_status"]
          tipo?: string | null
          updated_at?: string
          user_id?: string
          valor?: number | null
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transportes_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      viagem_convites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["viagem_role"]
          status: Database["public"]["Enums"]["convite_status"]
          token_hash: string
          updated_at: string
          viagem_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["viagem_role"]
          status?: Database["public"]["Enums"]["convite_status"]
          token_hash: string
          updated_at?: string
          viagem_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["viagem_role"]
          status?: Database["public"]["Enums"]["convite_status"]
          token_hash?: string
          updated_at?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagem_convites_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      viagem_membros: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["viagem_role"]
          updated_at: string
          user_id: string
          viagem_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role: Database["public"]["Enums"]["viagem_role"]
          updated_at?: string
          user_id: string
          viagem_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["viagem_role"]
          updated_at?: string
          user_id?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viagem_membros_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      viagens: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          destino: string | null
          id: string
          nome: string
          status: Database["public"]["Enums"]["viagem_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          destino?: string | null
          id?: string
          nome: string
          status?: Database["public"]["Enums"]["viagem_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          destino?: string | null
          id?: string
          nome?: string
          status?: Database["public"]["Enums"]["viagem_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      viajantes: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
          user_id: string
          viagem_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
          user_id: string
          viagem_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viajantes_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      voos: {
        Row: {
          companhia: string | null
          created_at: string
          data: string | null
          destino: string | null
          id: string
          moeda: string | null
          numero: string | null
          origem: string | null
          status: Database["public"]["Enums"]["reserva_status"]
          updated_at: string
          user_id: string
          valor: number | null
          viagem_id: string
        }
        Insert: {
          companhia?: string | null
          created_at?: string
          data?: string | null
          destino?: string | null
          id?: string
          moeda?: string | null
          numero?: string | null
          origem?: string | null
          status?: Database["public"]["Enums"]["reserva_status"]
          updated_at?: string
          user_id: string
          valor?: number | null
          viagem_id: string
        }
        Update: {
          companhia?: string | null
          created_at?: string
          data?: string | null
          destino?: string | null
          id?: string
          moeda?: string | null
          numero?: string | null
          origem?: string | null
          status?: Database["public"]["Enums"]["reserva_status"]
          updated_at?: string
          user_id?: string
          valor?: number | null
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voos_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_trip: {
        Args: { _viagem_id: string }
        Returns: boolean
      }
      can_view_trip: {
        Args: { _viagem_id: string }
        Returns: boolean
      }
      is_trip_owner: {
        Args: { _viagem_id: string }
        Returns: boolean
      }
      trip_role: {
        Args: { _viagem_id: string }
        Returns: Database["public"]["Enums"]["viagem_role"] | null
      }
    }
    Enums: {
      convite_status: "pending" | "accepted" | "revoked" | "expired"
      reserva_status: "confirmado" | "pendente" | "cancelado"
      tarefa_prioridade: "baixa" | "media" | "alta"
      viagem_role: "owner" | "editor" | "viewer"
      viagem_status: "planejada" | "em_andamento" | "concluida"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      reserva_status: ["confirmado", "pendente", "cancelado"],
      tarefa_prioridade: ["baixa", "media", "alta"],
      viagem_status: ["planejada", "em_andamento", "concluida"],
    },
  },
} as const
