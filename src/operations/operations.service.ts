import { Injectable } from '@nestjs/common';
import {
  DashboardSprint,
  RotationHistory,
  CurrentEngineer,
  PerformanceSummary,
  PerformanceTrend,
} from '../supabase/interfaces/supabase-interface';

@Injectable()
export class OperationsService {
  calculateLastClosedSprintPerformance(
    sprints: DashboardSprint[],
    historyData: RotationHistory[],
    currentEngineers: CurrentEngineer[],
  ): PerformanceSummary | null {
    if (!sprints?.length) return null;

    const sortedSprints = [...sprints].sort((a, b) => {
      const numA = parseInt(a.id.replace('sprint-', ''), 10);
      const numB = parseInt(b.id.replace('sprint-', ''), 10);
      return numA - numB;
    });

    const total = sortedSprints.length;

    let sprintClosed = sortedSprints[total - 1];

    if (!sprintClosed.sprintClosed && total > 1) {
      sprintClosed = sortedSprints[total - 2];
    }

    const members = sprintClosed.members ?? [];

    const evaluatedMembers = members.filter((data) => {
      if (data.rating === 'Arquitecto') return false;

      const persona = currentEngineers.find((p) => p.name === data.name);
      if (!persona) return false;

      if (persona.replacementStartSprintId) {
        const joinDate = this.getJoinDateFromHistory(historyData, persona.id);
        const sprintCloseDate = this.toDate(sprintClosed.endDate);
        if (joinDate && sprintCloseDate && joinDate > sprintCloseDate) {
          return false;
        }
      }

      return true;
    });

    const average =
      evaluatedMembers.reduce(
        (acc: number, i) => acc + (i.total_final || 0),
        0,
      ) / (evaluatedMembers.length || 1);

    const finalAverage = Math.round(average * 100) / 100;

    return {
      sprintId: sprintClosed.id,
      average: finalAverage,
      status: sprintClosed.sprintClosed ? 'Completado' : 'En proceso',
      rating: this.rate(finalAverage),
      totalEvaluated: evaluatedMembers.length,
    };
  }

  private getJoinDateFromHistory(
    historyData: RotationHistory[],
    personaId: string,
  ): Date | null {
    const history = historyData.find(
      (h) =>
        h.personnelId === personaId &&
        h.type === 'cubriendo-vacaciones' &&
        h.date,
    );

    return history?.date ? new Date(history.date) : null;
  }

  private toDate(value: boolean | string | Date | null): Date | null {
    if (!value || typeof value === 'boolean') return null;

    return value instanceof Date ? value : new Date(value);
  }

  private rate(average: number): string {
    if (average >= 90) return '🌟 Rendimiento excelente';
    if (average >= 75) return '👍 Buen rendimiento';
    if (average >= 60) return '⚠️ Rendimiento moderado';
    return '🔴 Bajo rendimiento';
  }

  calculateSprintPerformance(
    sprints: DashboardSprint[],
    historyData: RotationHistory[],
    currentEngineers: CurrentEngineer[],
  ): PerformanceTrend | null {
    if (!sprints?.length) return null;

    const sortedSprints = [...sprints].sort(
      (a, b) =>
        new Date(a.startDate ?? 0).getTime() -
        new Date(b.startDate ?? 0).getTime(),
    );

    const latestSprints = sortedSprints.slice(-8);

    const labels: string[] = [];
    const values: number[] = [];
    for (const sprint of latestSprints) {
      const members = sprint.members ?? [];
      const evaluatedMembers = members.filter((data) => {
        if (data.rating === 'Arquitecto') return false;

        const persona = currentEngineers.find((p) => p.name === data.name);
        if (!persona) return false;

        if (persona.replacementStartSprintId) {
          const joinDate = this.getJoinDateFromHistory(historyData, persona.id);
          const sprintCloseDate = this.toDate(sprint.endDate);
          if (joinDate && sprintCloseDate && joinDate > sprintCloseDate) {
            return false;
          }
        }

        return true;
      });

      const average =
        evaluatedMembers.reduce(
          (acc: number, i) => acc + (i.total_final || 0),
          0,
        ) / (evaluatedMembers.length || 1);

      labels.push(sprint.id);
      values.push(Math.round(average * 100) / 100);
    }
    return {
      labels,
      values,
    };
  }
}
